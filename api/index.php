

<?php

ini_set('display_errors', '1');
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';

echo "Bootstrap passed<br>";

$request = \Illuminate\Http\Request::capture();

echo "Request captured<br>";

$response = $app->handleRequest($request);

echo "Request handled";
