<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="csrf-token" content="{{ csrf_token() }}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ClipTrack | ClipTop Barbers</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{{ asset('css/style.css') }}">
</head>
<body>
<header class="top">
  <div class="pole" aria-hidden="true"></div>
  <div class="bar">
    <a class="brand" href="#" data-top="home"><span class="mark">ClipTrack</span><span class="shop">ClipTop Barbers</span></a>
    <nav id="topnav" aria-label="Main"></nav>
  </div>
</header>
<main id="main"></main>
<div class="foot"><span>Prototype for Sprint 1 and 2 modules. Demo data is saved in this browser only.</span><button type="button" data-top="login" id="footLogin">Staff login</button><button type="button" data-top="reset">Reset demo data</button></div>
<dialog id="modal"></dialog>
<div id="toast" role="status" aria-live="polite"></div>

<script src="{{ asset('js/api.js') }}"></script>
<script src="{{ asset('js/app.js') }}"></script>
</body>
</html>
