<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Modules 2 and 3: online requests and walk-ins
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appointments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained('clients');
            $table->foreignId('service_id')->constrained('services');
            $table->foreignId('staff_id')->constrained('staff');
            $table->date('appt_date');
            $table->time('appt_time');
            $table->enum('status', ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'])->default('pending');
            $table->enum('source', ['online', 'walk-in'])->default('online');
            $table->timestamps();
            $table->index(['staff_id', 'appt_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appointments');
    }
};
