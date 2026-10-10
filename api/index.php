
<?php

$autoload = __DIR__ . '/../vendor/autoload.php';
$framework = __DIR__ . '/../vendor/laravel/framework/src/Illuminate/Foundation/Application.php';

echo "Autoload exists: " . (file_exists($autoload) ? "YES" : "NO") . "<br>";
echo "Framework file exists: " . (file_exists($framework) ? "YES" : "NO") . "<br>";

if (file_exists($autoload)) {
    require $autoload;
    echo "Laravel class available: " .
        (class_exists(\Illuminate\Foundation\Application::class) ? "YES" : "NO");
}
