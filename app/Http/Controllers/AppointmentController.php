<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\Client;
use App\Models\Service;
use App\Models\Staff;
use App\Support\Availability;
use App\Support\Phone;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

// Modules 2 and 3: public booking, walk-ins, and appointment management.
class AppointmentController extends Controller
{
    private function row(Appointment $a): array
    {
        return [
            'id' => $a->id,
            'clientId' => $a->client_id,
            'serviceId' => $a->service_id,
            'staffId' => $a->staff_id,
            'date' => $a->appt_date,
            'time' => substr($a->appt_time, 0, 5),
            'status' => $a->status,
            'source' => $a->source,
            'clientName' => $a->client->name ?? '',
            'contact' => $a->client->contact ?? '',
            'serviceName' => $a->service->name ?? '',
            'price' => (float) ($a->service->price ?? 0),
            'duration' => (int) ($a->service->duration_min ?? 0),
            'staffName' => $a->staff->name ?? '',
        ];
    }

    private function fail(string $message, int $code)
    {
        return response()->json(['error' => $message], $code);
    }

    // Staff and admin: list appointments.  ?q=name&date=2026-10-12&status=pending&staffId=2
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $digits = Phone::norm($q);

        $rows = Appointment::with(['client', 'service', 'staff'])
            ->when($q !== '', function ($qb) use ($q, $digits) {
                $qb->whereHas('client', function ($c) use ($q, $digits) {
                    $c->where(function ($w) use ($q, $digits) {
                        $w->where('name', 'like', '%' . $q . '%');
                        if ($digits !== '') {
                            $w->orWhere('contact', 'like', '%' . $digits . '%');
                        }
                    });
                });
            })
            ->when($request->query('date'), fn ($qb, $d) => $qb->where('appt_date', $d))
            ->when($request->query('status'), fn ($qb, $s) => $qb->where('status', $s))
            ->when($request->query('staffId'), fn ($qb, $s) => $qb->where('staff_id', $s))
            ->orderByDesc('appt_date')->orderByDesc('appt_time')
            ->get();

        return response()->json($rows->map(fn ($a) => $this->row($a))->values());
    }

    // Public: open start times.  /api/slots?serviceId=1&date=2026-10-12&staffId=any
    public function slots(Request $request)
    {
        $v = Validator::make($request->query(), [
            'serviceId' => 'required|integer',
            'date' => 'required|date_format:Y-m-d',
        ]);
        if ($v->fails()) {
            return $this->fail($v->errors()->first(), 422);
        }
        $date = $request->query('date');
        if ($date < Carbon::today()->toDateString()) {
            return response()->json([]);
        }
        $staffId = $request->query('staffId', 'any');
        if ($staffId !== 'any' && !ctype_digit((string) $staffId)) {
            $staffId = 'any';
        }
        // Only logged-in staff may see past times (for walk-ins).
        $allowPast = Auth::check() && $request->boolean('allowPast');
        $ignoreId = Auth::check() && $request->query('ignoreId') ? (int) $request->query('ignoreId') : null;

        return response()->json(Availability::slots((int) $request->query('serviceId'), $date, $staffId, $allowPast, $ignoreId));
    }

    // Public: the earliest open slot in the next 8 days (shown on the landing page).
    public function nextOpen()
    {
        $services = Service::where('active', true)->orderBy('id')->get();
        for ($i = 0; $i < 8; $i++) {
            $date = Carbon::today()->addDays($i)->toDateString();
            $best = null;
            foreach ($services as $s) {
                $slots = Availability::slots($s->id, $date, 'any');
                if (!empty($slots) && ($best === null || $slots[0]['time'] < $best['time'])) {
                    $best = ['date' => $date, 'time' => $slots[0]['time'], 'staffId' => $slots[0]['staffId'], 'serviceId' => $s->id];
                }
            }
            if ($best !== null) {
                return response()->json($best);
            }
        }
        return response()->json(null);
    }

    /**
     * Shared by the public form and walk-ins:
     * checks the service, the barber, working hours, and double booking, matches or creates the client, saves.
     * The barber's row is locked during the save so two people cannot take the same slot at the same moment.
     */
    private function make(array $d, string $source, string $status, bool $allowPast): array
    {
        return DB::transaction(function () use ($d, $source, $status, $allowPast) {
            $service = Service::where('active', true)->find($d['serviceId']);
            if (!$service) {
                return ['error' => 'That service is not available.', 'code' => 422];
            }
            $duration = (int) $service->duration_min;

            $staff = Staff::where('active', true)->lockForUpdate()->find($d['staffId']);
            if (!$staff) {
                return ['error' => 'That barber is not available.', 'code' => 422];
            }

            $start = Availability::toMin($d['time']);

            if (!$allowPast && $d['date'] === Carbon::today()->toDateString() && $start <= Carbon::now()->hour * 60 + Carbon::now()->minute) {
                return ['error' => 'That time has already passed. Please pick a later time.', 'code' => 422];
            }

            $ok = $staff->services()->where('services.id', $service->id)->exists()
                && Availability::withinHours($staff, $d['date'], $start, $duration)
                && Availability::isFree($staff->id, $d['date'], $start, $duration);

            // "Any available barber": if the first choice just got taken, try another barber at the same time.
            if (!$ok && !empty($d['anyStaff'])) {
                $alt = collect(Availability::slots($service->id, $d['date'], 'any', $allowPast))->firstWhere('time', $d['time']);
                if ($alt) {
                    $staff = Staff::lockForUpdate()->find($alt['staffId']);
                    $ok = $staff && Availability::isFree($staff->id, $d['date'], $start, $duration);
                }
            }
            if (!$ok) {
                return ['error' => 'That time was just taken. Please pick another time.', 'code' => 409];
            }

            // Match a returning client by phone number (or by name when no number was given), otherwise create a profile.
            $phone = Phone::norm($d['contact'] ?? '');
            if ($phone !== '') {
                $client = Client::where('contact', $phone)->first();
            } else {
                $client = Client::whereRaw('LOWER(name) = ?', [mb_strtolower($d['name'])])->first();
            }
            $returning = (bool) $client;
            if (!$client) {
                $client = Client::create(['name' => $d['name'], 'contact' => $phone !== '' ? $phone : null]);
            }
            $prev = $client->appointments()->where('status', 'completed')->count();

            $a = Appointment::create([
                'client_id' => $client->id,
                'service_id' => $service->id,
                'staff_id' => $staff->id,
                'appt_date' => $d['date'],
                'appt_time' => $d['time'],
                'status' => $status,
                'source' => $source,
            ]);

            return ['data' => [
                'id' => $a->id,
                'clientName' => $client->name,
                'returning' => $returning,
                'prevVisits' => $prev,
                'serviceId' => $service->id,
                'staffId' => $staff->id,
                'staffName' => $staff->name,
                'date' => $d['date'],
                'time' => $d['time'],
                'status' => $status,
            ]];
        });
    }

    // Public booking form (no login): creates a PENDING online request.
    public function storePublic(Request $request)
    {
        $v = Validator::make($request->all(), [
            'name' => 'required|string|min:2|max:100',
            'contact' => 'required|string|max:30',
            'serviceId' => 'required|integer',
            'staffId' => 'required|integer',
            'date' => 'required|date_format:Y-m-d',
            'time' => 'required|date_format:H:i',
            'anyStaff' => 'boolean',
        ]);
        if ($v->fails()) {
            return $this->fail($v->errors()->first(), 422);
        }
        if (!Phone::valid($request->contact)) {
            return $this->fail('Enter a valid mobile number, like 0917 123 4567.', 422);
        }
        $date = $request->date;
        if ($date < Carbon::today()->toDateString() || $date > Carbon::today()->addDays(60)->toDateString()) {
            return $this->fail('Choose a date within the next 60 days.', 422);
        }

        $r = $this->make([
            'name' => trim($request->name),
            'contact' => $request->contact,
            'serviceId' => $request->serviceId,
            'staffId' => $request->staffId,
            'date' => $date,
            'time' => $request->time,
            'anyStaff' => $request->boolean('anyStaff'),
        ], 'online', 'pending', false);

        if (isset($r['error'])) {
            return $this->fail($r['error'], $r['code']);
        }
        $d = $r['data'];
        AuditLog::record('Public booking form', 'New online booking: Appointment #' . $d['id'] . ' for ' . $d['clientName'] . ($d['returning'] ? ' (returning client)' : ' (new client)'));
        return response()->json($d, 201);
    }

    // Staff and admin: add a walk-in (confirmed right away). Contact number is optional.
    public function storeWalkIn(Request $request)
    {
        $v = Validator::make($request->all(), [
            'name' => 'required|string|min:2|max:100',
            'contact' => 'nullable|string|max:30',
            'serviceId' => 'required|integer',
            'staffId' => 'required|integer',
            'date' => 'required|date_format:Y-m-d',
            'time' => 'required|date_format:H:i',
            'anyStaff' => 'boolean',
        ]);
        if ($v->fails()) {
            return $this->fail($v->errors()->first(), 422);
        }
        if ($request->filled('contact') && !Phone::valid($request->contact)) {
            return $this->fail('Enter a valid mobile number or leave it blank.', 422);
        }

        $r = $this->make([
            'name' => trim($request->name),
            'contact' => (string) $request->contact,
            'serviceId' => $request->serviceId,
            'staffId' => $request->staffId,
            'date' => $request->date,
            'time' => $request->time,
            'anyStaff' => $request->boolean('anyStaff'),
        ], 'walk-in', 'confirmed', true);

        if (isset($r['error'])) {
            return $this->fail($r['error'], $r['code']);
        }
        $d = $r['data'];
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' added walk-in Appointment #' . $d['id'] . ' for ' . $d['clientName']);
        return response()->json($d, 201);
    }

    // Staff and admin: confirm, complete, cancel, or mark no-show.
    public function updateStatus(Request $request, $id)
    {
        $v = Validator::make($request->all(), ['status' => 'required|in:confirmed,completed,cancelled,no-show']);
        if ($v->fails()) {
            return $this->fail('Invalid status.', 422);
        }
        $a = Appointment::find($id);
        if (!$a) {
            return $this->fail('Appointment not found.', 404);
        }
        $a->update(['status' => $request->status]);
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' marked Appointment #' . $a->id . ' as ' . $request->status);
        return response()->json(['ok' => true, 'status' => $a->status]);
    }

    // Staff and admin: move an appointment to a new date and time (same barber, same service).
    public function reschedule(Request $request, $id)
    {
        $v = Validator::make($request->all(), [
            'date' => 'required|date_format:Y-m-d',
            'time' => 'required|date_format:H:i',
        ]);
        if ($v->fails()) {
            return $this->fail($v->errors()->first(), 422);
        }

        $result = DB::transaction(function () use ($request, $id) {
            $a = Appointment::with('service')->find($id);
            if (!$a) {
                return ['error' => 'Appointment not found.', 'code' => 404];
            }
            $staff = Staff::lockForUpdate()->find($a->staff_id);
            $duration = (int) $a->service->duration_min;
            $start = Availability::toMin($request->time);

            if (!$staff
                || !Availability::withinHours($staff, $request->date, $start, $duration)
                || !Availability::isFree($staff->id, $request->date, $start, $duration, $a->id)) {
                return ['error' => 'That time is not available. Pick another.', 'code' => 409];
            }
            $a->update(['appt_date' => $request->date, 'appt_time' => $request->time]);
            return ['a' => $a];
        });

        if (isset($result['error'])) {
            return $this->fail($result['error'], $result['code']);
        }
        $a = $result['a'];
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' rescheduled Appointment #' . $a->id . ' to ' . Carbon::parse($request->date . ' ' . $request->time)->format('D, M j, g:i A'));
        return response()->json(['ok' => true]);
    }
}
