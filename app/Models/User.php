<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;

// Staff and admin accounts only. Customers never log in.
class User extends Authenticatable
{
    protected $fillable = ['username', 'password', 'role', 'full_name', 'staff_id'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return ['password' => 'hashed'];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }
}
