
<?php

error_reporting(E_ALL);
ini_set('display_errors', '1');

echo "Step 1: PHP works<br>";

$autoload = __DIR__ . '/../vendor/autoload.php';

if (!file_exists($autoload)) {
    die("ERROR: vendor/autoload.php is missing");
}

echo "Step 2: Composer autoload exists<br>";

require $autoload;

echo "Step 3: Composer autoload loaded<br>";

$appFile = __DIR__ . '/../bootstrap/app.php';

if (!file_exists($appFile)) {
    die("ERROR: bootstrap/app.php is missing");
}

echo "Step 4: Laravel bootstrap file exists<br>";

require $appFile;

echo "Step 5: Laravel bootstrap loaded<br>";
