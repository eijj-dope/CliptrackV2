<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

// Module 1: login, logout, who am I
class AuthController extends Controller
{
    private function userData($u): array
    {
        return ['id' => $u->id, 'username' => $u->username, 'role' => $u->role, 'name' => $u->full_name, 'staffId' => $u->staff_id];
    }

    public function login(Request $request)
    {
        $credentials = [
            'username' => strtolower(trim((string) $request->input('username'))),
            'password' => (string) $request->input('password'),
        ];
        if (!Auth::attempt($credentials)) {
            return response()->json(['error' => 'Wrong username or password.'], 401);
        }
        $request->session()->regenerate();
        $u = Auth::user();
        AuditLog::record($u->full_name, $u->full_name . ' logged in');
        // Laravel issues a NEW security token at login. Send it so the page can keep saving changes.
        return response()->json($this->userData($u) + ['csrfToken' => csrf_token()]);
    }

    public function logout(Request $request)
    {
        $u = Auth::user();
        if ($u) {
            AuditLog::record($u->full_name, $u->full_name . ' logged out');
        }
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->json(['ok' => true]);
    }

    // Logged-in user changes their own password.
    public function changePassword(Request $request)
    {
        $v = Validator::make($request->all(), [
            'current' => 'required|string',
            'password' => 'required|string|min:6|max:100',
        ]);
        if ($v->fails()) {
            return response()->json(['error' => $v->errors()->first()], 422);
        }
        $u = Auth::user();
        if (!Hash::check($request->current, $u->password)) {
            return response()->json(['error' => 'Your current password is incorrect.'], 422);
        }
        $u->password = $request->password; // hashed automatically by the User model
        $u->save();
        AuditLog::record($u->full_name, $u->full_name . ' changed their password');
        return response()->json(['ok' => true]);
    }

    public function me()
    {
        if (!Auth::check()) {
            return response()->json(['error' => 'Not logged in.'], 401);
        }
        return response()->json($this->userData(Auth::user()) + ['csrfToken' => csrf_token()]);
    }
}
