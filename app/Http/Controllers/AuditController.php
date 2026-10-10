<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;

// Module 1: audit log (admin only, see routes/web.php)
class AuditController extends Controller
{
    public function index()
    {
        return response()->json(
            AuditLog::orderByDesc('id')->limit(100)->get()->map(fn ($l) => [
                'id' => $l->id,
                'ts' => $l->created_at?->toIso8601String(),
                'user' => $l->actor,
                'text' => $l->action_text,
            ])->values()
        );
    }
}
