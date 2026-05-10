<script>
  // Pinned to 2026-05-13 (Bike to Work event). Switch to dynamic "today"
  // once we want the map to default to current-day rides.
  const mapDate = '2026-05-13';
</script>

<svelte:head>
  <title>Ride Map - Philly Bike Train</title>
</svelte:head>

<div class="container mx-auto px-6 py-8">
  <div class="mb-6">
    <h1 class="text-4xl font-bold mb-3 text-warm-gray-900">Ride Map</h1>
    <p class="text-lg text-warm-gray-700 max-w-3xl">
      Every Philly Bike Train ride on one map. Powered by Go There.
    </p>
  </div>

  <div class="rounded-2xl overflow-hidden shadow-lg border border-warm-gray-200 bg-white">
    <iframe
      title="All rides map"
      src="https://api.gothere.bike/map?date={mapDate}"
      style="width:100%; height:75vh; min-height:600px; border:0; display:block;"
      loading="lazy"
    ></iframe>
  </div>
</div>
