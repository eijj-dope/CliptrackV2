<?php

namespace App\Support;

use App\Models\Appointment;
use App\Models\Service;
use App\Models\Staff;
use Carbon\Carbon;

/**
 * The scheduling brain of ClipTrack: which time slots are open, and is a barber free at a given time.
 * Appointments are measured in minutes since midnight (09:30 = 570).
 */
class Availability
{
    // Statuses that occupy a barber's time. Cancelled and no-show free the slot again.
    public const BLOCKING = ['pending', 'confirmed', 'completed'];

    public static function toMin(string $t): int
    {
        $p = explode(':', $t);
        return ((int) $p[0]) * 60 + ((int) ($p[1] ?? 0));
    }

    public static function fromMin(int $m): string
    {
        return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
    }

    // Is this barber working on that day, and does the whole service fit inside their hours?
    public static function withinHours(Staff $staff, string $date, int $start, int $duration): bool
    {
        $dow = Carbon::parse($date)->dayOfWeek; // 0 = Sunday ... 6 = Saturday
        if (!in_array($dow, $staff->workDays(), true)) {
            return false;
        }
        return $start >= self::toMin($staff->work_start)
            && $start + $duration <= self::toMin($staff->work_end);
    }

    // Double-booking check: does [start, start + duration) overlap an existing appointment of this barber?
    public static function isFree(int $staffId, string $date, int $start, int $duration, ?int $ignoreId = null): bool
    {
        $rows = Appointment::with('service')
            ->where('staff_id', $staffId)
            ->where('appt_date', $date)
            ->whereIn('status', self::BLOCKING)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->get();

        foreach ($rows as $a) {
            $s = self::toMin($a->appt_time);
            $e = $s + (int) $a->service->duration_min;
            if ($start < $e && $s < $start + $duration) {
                return false;
            }
        }
        return true;
    }

    /**
     * Open start times (every 30 minutes) for a service on a date.
     * $staffId is a barber id or 'any' (then the first free barber is assigned to each time).
     * Returns [['time' => '10:00', 'staffId' => 2], ...]
     */
    public static function slots($serviceId, string $date, $staffId = 'any', bool $allowPast = false, ?int $ignoreId = null): array
    {
        $service = Service::where('active', true)->find($serviceId);
        if (!$service) {
            return [];
        }
        $duration = (int) $service->duration_min;

        $query = Staff::with('services')->where('active', true)->orderBy('id');
        if ($staffId !== 'any') {
            $query->where('id', $staffId);
        }
        $pool = $query->get();

        $now = Carbon::now();
        $isToday = $date === $now->toDateString();
        $nowMin = $now->hour * 60 + $now->minute;

        $out = [];
        foreach ($pool as $s) {
            if (!$s->services->contains('id', $service->id)) {
                continue;
            }
            for ($m = self::toMin($s->work_start); $m + $duration <= self::toMin($s->work_end); $m += 30) {
                $key = self::fromMin($m);
                if (isset($out[$key])) {
                    continue;
                }
                if ($isToday && !$allowPast && $m <= $nowMin) {
                    continue;
                }
                if (!self::withinHours($s, $date, $m, $duration)) {
                    continue;
                }
                if (self::isFree($s->id, $date, $m, $duration, $ignoreId)) {
                    $out[$key] = $s->id;
                }
            }
        }
        ksort($out);

        $list = [];
        foreach ($out as $time => $sid) {
            $list[] = ['time' => $time, 'staffId' => $sid];
        }
        return $list;
    }
}
