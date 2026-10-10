
<?php

ini_set('display_errors', '1');
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

try {
    $app = require __DIR__ . '/../bootstrap/app.php';

    $request = \Illuminate\Http\Request::capture();

    $app->handleRequest($request);

} catch (\Throwable $e) {
    echo "ERROR: " . get_class($e) . "<br>";
    echo "MESSAGE: " . htmlspecialchars($e->getMessage()) . "<br>";
    echo "FILE: " . htmlspecialchars($e->getFile()) . "<br>";
    echo "LINE: " . $e->getLine();
}
