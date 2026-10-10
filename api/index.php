
<?php

$writable = '/tmp/cliptrack';

foreach ([
    "$writable/storage/framework/cache/data",
    "$writable/storage/framework/sessions",
    "$writable/storage/framework/views",
    "$writable/storage/logs",
    "$writable/bootstrap/cache",
] as $dir) {
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
}

putenv("APP_STORAGE_PATH=$writable/storage");
putenv("APP_CONFIG_CACHE=$writable/bootstrap/cache/config.php");
putenv("APP_EVENTS_CACHE=$writable/bootstrap/cache/events.php");
putenv("APP_PACKAGES_CACHE=$writable/bootstrap/cache/packages.php");
putenv("APP_ROUTES_CACHE=$writable/bootstrap/cache/routes.php");
putenv("APP_SERVICES_CACHE=$writable/bootstrap/cache/services.php");

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';

$app->useStoragePath("$writable/storage");

$request = \Illuminate\Http\Request::capture();

$app->handleRequest($request);
