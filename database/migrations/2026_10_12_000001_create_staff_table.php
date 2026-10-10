<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->time('work_start')->default('09:00:00');
            $table->time('work_end')->default('18:00:00');
            $table->string('work_days', 20)->default('1,2,3,4,5,6'); // 0 = Sunday ... 6 = Saturday
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff');
    }
};
