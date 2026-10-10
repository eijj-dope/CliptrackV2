<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\Client;
use App\Models\Service;
use App\Models\Staff;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

// Demo data. Run with:  php artisan migrate:fresh --seed
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $sv = [];
        foreach ([
            ['Classic haircut', 150, 30],
            ['Fade haircut', 180, 45],
            ['Beard trim', 100, 30],
            ['Haircut and beard', 250, 60],
            ['Hair color', 600, 90],
        ] as $s) {
            $sv[] = Service::create(['name' => $s[0], 'price' => $s[1], 'duration_min' => $s[2]]);
        }

        $ramon = Staff::create(['name' => 'Ramon', 'work_start' => '09:00', 'work_end' => '18:00', 'work_days' => '1,2,3,4,5,6']);
        $migs = Staff::create(['name' => 'Migs', 'work_start' => '10:00', 'work_end' => '19:00', 'work_days' => '2,3,4,5,6']);
        $jun = Staff::create(['name' => 'Jun', 'work_start' => '09:00', 'work_end' => '17:00', 'work_days' => '1,2,3,4,5,6']);
        $st = [$ramon, $migs, $jun];

        $ramon->services()->sync(collect($sv)->pluck('id'));
        $migs->services()->sync([$sv[0]->id, $sv[1]->id, $sv[2]->id, $sv[3]->id]);
        $jun->services()->sync([$sv[0]->id, $sv[2]->id]);

        // Passwords are hashed automatically (see the User model).
        User::create(['username' => 'admin', 'password' => 'admin123', 'role' => 'admin', 'full_name' => 'Ramon (Owner)', 'staff_id' => $ramon->id]);
        User::create(['username' => 'migs', 'password' => 'staff123', 'role' => 'staff', 'full_name' => 'Migs', 'staff_id' => $migs->id]);
        User::create(['username' => 'jun', 'password' => 'staff123', 'role' => 'staff', 'full_name' => 'Jun', 'staff_id' => $jun->id]);

        $c = [];
        foreach ([
            ['Carlo Mendoza', '09171234567'],
            ['Paolo Reyes', '09189876543'],
            ['Joel Santos', '09201112233'],
            ['Marco Dela Cruz', '09175554444'],
            ['Ben Aquino', '09283334455'],
        ] as $x) {
            $c[] = Client::create(['name' => $x[0], 'contact' => $x[1]]);
        }

        // [days from today, time, client, service, barber, status, source]
        $today = Carbon::today();
        foreach ([
            [0, '09:00', 4, 0, 0, 'completed', 'walk-in'],
            [0, '10:00', 0, 1, 1, 'confirmed', 'online'],
            [0, '11:00', 1, 0, 0, 'pending', 'online'],
            [0, '13:30', 2, 3, 0, 'confirmed', 'walk-in'],
            [0, '15:00', 3, 2, 2, 'pending', 'online'],
            [1, '10:00', 0, 0, 0, 'confirmed', 'online'],
            [1, '14:00', 4, 1, 1, 'pending', 'online'],
            [-1, '10:00', 0, 1, 1, 'completed', 'online'],
            [-2, '15:00', 1, 0, 0, 'completed', 'online'],
            [-3, '12:00', 4, 4, 1, 'no-show', 'online'],
            [-4, '11:30', 1, 2, 2, 'cancelled', 'online'],
            [-5, '11:00', 2, 2, 2, 'completed', 'walk-in'],
            [-6, '16:00', 0, 0, 0, 'completed', 'online'],
            [-9, '10:00', 3, 0, 0, 'completed', 'online'],
            [-12, '13:00', 0, 3, 0, 'completed', 'online'],
        ] as $a) {
            Appointment::create([
                'client_id' => $c[$a[2]]->id,
                'service_id' => $sv[$a[3]]->id,
                'staff_id' => $st[$a[4]]->id,
                'appt_date' => $today->copy()->addDays($a[0])->toDateString(),
                'appt_time' => $a[1],
                'status' => $a[5],
                'source' => $a[6],
            ]);
        }

        AuditLog::record('System', 'Demo data loaded');
    }
}
