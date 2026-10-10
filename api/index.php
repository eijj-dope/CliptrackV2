
<?php

$app = require __DIR__ . '/../bootstrap/app.php';

echo "Laravel app loaded<br>";

if ($app instanceof \Illuminate\Foundation\Application) {
    echo "Laravel application instance is valid";
} else {
    echo "ERROR: Laravel application instance is invalid";
}
