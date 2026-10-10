<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Module 4: which barber can perform which service
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_service', function (Blueprint $table) {
            $table->foreignId('staff_id')->constrained('staff')->cascadeOnDelete();
            $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
            $table->primary(['staff_id', 'service_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_service');
    }
};
