<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

// Module 4: staff, working hours, and which services each barber performs.
class StaffController extends Controller
{
    private function row(Staff $s): array
    {
        return [
            'id' => $s->id,
            'name' => $s->name,
            'start' => substr($s->work_start, 0, 5),
            'end' => substr($s->work_end, 0, 5),
            'days' => $s->workDays(),
            'services' => $s->services->pluck('id')->values(),
        ];
    }

    // Public: the landing page and booking form show barbers, their hours, and their services.
    public function index()
    {
        return response()->json(Staff::with('services')->where('active', true)->orderBy('id')->get()->map(fn ($s) => $this->row($s))->values());
    }

    // Admin: change hours, working days, and assigned services.
    public function update(Request $request, $id)
    {
        $s = Staff::find($id);
        if (!$s) {
            return response()->json(['error' => 'Barber not found.'], 404);
        }
        $v = Validator::make($request->all(), [
            'start' => 'required|date_format:H:i',
            'end' => 'required|date_format:H:i|after:start',
            'days' => 'array',
            'days.*' => 'integer|between:0,6',
            'services' => 'array',
            'services.*' => 'integer|exists:services,id',
        ]);
        if ($v->fails()) {
            return response()->json(['error' => $v->errors()->first()], 422);
        }
        $s->update([
            'work_start' => $request->start,
            'work_end' => $request->end,
            'work_days' => implode(',', array_unique($request->input('days', []))),
        ]);
        $s->services()->sync($request->input('services', []));
        $who = Auth::user()->full_name;
        AuditLog::record($who, $who . ' updated staff hours and services for ' . $s->name);
        return response()->json($this->row($s->load('services')));
    }
}
