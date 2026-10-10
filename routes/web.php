<?php

use App\Http\Controllers\AppointmentController;
use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\ServiceController;
use App\Http\Controllers\StaffController;
use App\Http\Middleware\AdminOnly;
use App\Http\Middleware\RequireLogin;
use Illuminate\Support\Facades\Route;

// The website itself (landing page, booking form, staff dashboard)
Route::get('/', fn () => view('app'));

// Backend API.  To add a feature: make a controller, then add its routes below.
Route::prefix('api')->group(function () {

    Route::get('/health', fn () => response()->json(['ok' => true, 'app' => 'ClipTrack']));
    Route::get('/csrf', fn () => response()->json(['csrfToken' => csrf_token()]));

    // Public (no login): the landing page and booking form use these
    Route::get('/services', [ServiceController::class, 'index']);
    Route::get('/staff', [StaffController::class, 'index']);
    Route::get('/slots', [AppointmentController::class, 'slots']);
    Route::get('/next-open', [AppointmentController::class, 'nextOpen']);
    Route::post('/appointments/public', [AppointmentController::class, 'storePublic'])->middleware('throttle:20,1');

    // Login
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    // Staff and admin
    Route::middleware(RequireLogin::class)->group(function () {
        Route::post('/auth/password', [AuthController::class, 'changePassword']);
        Route::get('/appointments', [AppointmentController::class, 'index']);
        Route::post('/appointments/walk-in', [AppointmentController::class, 'storeWalkIn']);
        Route::patch('/appointments/{id}/status', [AppointmentController::class, 'updateStatus']);
        Route::patch('/appointments/{id}/reschedule', [AppointmentController::class, 'reschedule']);
        Route::get('/clients', [ClientController::class, 'index']);
        Route::get('/clients/{id}/history', [ClientController::class, 'history']);
    });

    // Admin only
    Route::middleware(AdminOnly::class)->group(function () {
        Route::post('/services', [ServiceController::class, 'store']);
        Route::put('/services/{id}', [ServiceController::class, 'update']);
        Route::delete('/services/{id}', [ServiceController::class, 'destroy']);
        Route::put('/staff/{id}', [StaffController::class, 'update']);
        Route::get('/audit', [AuditController::class, 'index']);
    });

    // Coming in later sprints:
    // Route::...  billing (Module 8), feedback (Module 9), analytics (Module 10)
});
