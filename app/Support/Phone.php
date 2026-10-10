<?php

namespace App\Support;

class Phone
{
    // +63 917 123 4567 or 0917-123-4567  ->  09171234567
    public static function norm(?string $v): string
    {
        $d = preg_replace('/[^\d+]/', '', (string) $v);
        if (str_starts_with($d, '+63')) {
            $d = '0' . substr($d, 3);
        } elseif (str_starts_with($d, '63') && strlen($d) === 12) {
            $d = '0' . substr($d, 2);
        }
        return $d;
    }

    public static function valid(?string $v): bool
    {
        return (bool) preg_match('/^09\d{9}$/', self::norm($v));
    }
}
