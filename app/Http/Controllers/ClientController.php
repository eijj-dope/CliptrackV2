<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Service;
use App\Support\Phone;
use Illuminate\Http\Request;

// Module 6: client list, search, and visit history.
class ClientController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $digits = Phone::norm($q);

        $clients = Client::query()
            ->when($q !== '', function ($qb) use ($q, $digits) {
                $qb->where(function ($w) use ($q, $digits) {
                    $w->where('name', 'like', '%' . $q . '%');
                    if ($digits !== '') {
                        $w->orWhere('contact', 'like', '%' . $digits . '%');
                    }
                });
            })
            ->withCount(['appointments as visits' => fn ($a) => $a->where('status', 'completed')])
            ->withMax(['appointments as last_visit' => fn ($a) => $a->where('status', 'completed')], 'appt_date')
            ->orderByDesc('last_visit')
            ->get();

        // Each client's two most frequent completed services
        $counts = Appointment::selectRaw('client_id, service_id, COUNT(*) AS c')
            ->where('status', 'completed')
            ->groupBy('client_id', 'service_id')
            ->get()
            ->groupBy('client_id');
        $names = Service::pluck('name', 'id');

        return response()->json($clients->map(fn ($c) => [
            'id' => $c->id,
            'name' => $c->name,
            'contact' => $c->contact,
            'visits' => (int) $c->visits,
            'lastVisit' => $c->last_visit,
            'favorites' => $counts->get($c->id, collect())
                ->sortByDesc('c')->take(2)
                ->map(fn ($f) => $names[$f->service_id] ?? '')
                ->filter()->values(),
        ])->values());
    }

    public function history($id)
    {
        $client = Client::find($id);
        if (!$client) {
            return response()->json(['error' => 'Client not found.'], 404);
        }
        $rows = Appointment::with(['service', 'staff'])
            ->where('client_id', $client->id)
            ->orderByDesc('appt_date')->orderByDesc('appt_time')
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'date' => $a->appt_date,
                'time' => substr($a->appt_time, 0, 5),
                'status' => $a->status,
                'serviceName' => $a->service->name ?? '',
                'staffName' => $a->staff->name ?? '',
                'price' => (float) ($a->service->price ?? 0),
            ])->values();

        return response()->json(['client' => ['id' => $client->id, 'name' => $client->name, 'contact' => $client->contact], 'visits' => $rows]);
    }
}
