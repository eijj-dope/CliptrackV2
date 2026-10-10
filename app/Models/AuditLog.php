<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = ['actor', 'action_text'];

    // AuditLog::record('Migs', 'Migs marked Appointment #12 as completed');
    public static function record(string $actor, string $text): void
    {
        static::create(['actor' => $actor, 'action_text' => $text]);
    }
}
