<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

// Admin (owner) only. Staff get a 403 even if they type the address by hand.
class AdminOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!Auth::check()) {
            return response()->json(['error' => 'Please log in first.'], 401);
        }
        if (Auth::user()->role !== 'admin') {
            return response()->json(['error' => 'Admins only.'], 403);
        }
        return $next($request);
    }
}
