<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Staff extends Model
{
    protected $table = 'staff';

    protected $fillable = ['name', 'work_start', 'work_end', 'work_days', 'active'];

    public function services()
    {
        return $this->belongsToMany(Service::class, 'staff_service');
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class);
    }

    // "1,2,3,4,5,6" -> [1,2,3,4,5,6]   (0 = Sunday)
    public function workDays(): array
    {
        return array_values(array_map('intval', array_filter(explode(',', (string) $this->work_days), 'strlen')));
    }
}
