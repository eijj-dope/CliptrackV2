<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Service;
use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

// Module 5: services and pricing. Listing is public (the booking form needs it); changes are admin only.
class ServiceController extends Controller
{
    private function row(Service $s): array
    {
        return ['id' => $s->id, 'name' => $s->name, 'price' => (float) $s->price, 'duration' => (int) $s->duration_min, 'active' => (bool) $s->active];
    }

    private function check(Request $request)
    {
        return Validator::make($request->all(), [
            'name' => 'required|string|max:100',
            'price' => 'required|numeric|min:0',
            'duration' => 'required|integer|min:5|max:480',
        ]);
    }

    public function index()
    {
        return response()->json(Service::where('active', true)->orderBy('id')->get()->map(fn ($s) => $this->row($s))->values());
    }

    public function store(Request $request)
    {
        $v = $this->check($request);
        if ($v->fails()) {
            return response()->json(['error' => $v->errors()->first()], 422);
        }
        $s = Service::create(['name' => trim($request->name), 'price' => $request->price, 'duration_min' => $request->duration]);
        // Make the new service bookable right away by giving it to the first barber (the owner). Admin can assign more later.
        Staff::orderBy('id')->first()?->services()->syncWithoutDetaching([$s->id]);
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' added service ' . $s->name);
        return response()->json($this->row($s), 201);
    }

    public function update(Request $request, $id)
    {
        $s = Service::find($id);
        if (!$s) {
            return response()->json(['error' => 'Service not found.'], 404);
        }
        $v = $this->check($request);
        if ($v->fails()) {
            return response()->json(['error' => $v->errors()->first()], 422);
        }
        $s->update(['name' => trim($request->name), 'price' => $request->price, 'duration_min' => $request->duration]);
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' edited service ' . $s->name);
        return response()->json($this->row($s));
    }

    // "Remove" only hides the service so old appointments keep their record.
    public function destroy($id)
    {
        $s = Service::find($id);
        if (!$s) {
            return response()->json(['error' => 'Service not found.'], 404);
        }
        $s->update(['active' => false]);
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' removed service ' . $s->name);
        return response()->json(['ok' => true]);
    }
}
