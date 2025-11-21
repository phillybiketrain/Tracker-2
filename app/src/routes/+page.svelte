<svelte:head>
  <title>Philly Bike Train - Home</title>
</svelte:head>

<div class="container mx-auto px-6 py-12">
  <!-- Action Cards -->
  <div class="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16">
    <!-- Find & Follow Rides -->
    <a href="/browse" class="card hover:shadow-md transition-all border-l-4 border-l-primary">
      <h2 class="text-3xl font-bold mb-2 text-warm-gray-900">Browse Rides</h2>
      <p class="text-warm-gray-600 mb-6">
        View scheduled bike trains and track leaders in real-time
      </p>
      <div class="btn btn-primary w-full text-center">
        Browse
      </div>
    </a>

    <!-- Lead a Ride -->
    <a href="/lead" class="card hover:shadow-md transition-all border-l-4 border-l-secondary">
      <h2 class="text-3xl font-bold mb-2 text-warm-gray-900">Lead a Ride</h2>
      <p class="text-warm-gray-600 mb-6">
        Create a route and broadcast your location to followers
      </p>
      <div class="btn btn-secondary w-full text-center">
        Create Route
      </div>
    </a>
  </div>

  <!-- How It Works -->
  <div class="max-w-4xl mx-auto">
    <h2 class="text-3xl font-bold mb-8 text-warm-gray-900">How It Works</h2>

    <div class="grid md:grid-cols-3 gap-6">
      <div class="card">
        <div class="text-sm font-bold text-primary mb-2">01</div>
        <h3 class="font-bold text-lg mb-2 text-warm-gray-900">Browse</h3>
        <p class="text-warm-gray-600 text-sm">
          View upcoming bike trains, filter by date
        </p>
      </div>

      <div class="card">
        <div class="text-sm font-bold text-secondary mb-2">02</div>
        <h3 class="font-bold text-lg mb-2 text-warm-gray-900">Track</h3>
        <p class="text-warm-gray-600 text-sm">
          Follow leader's GPS location in real-time
        </p>
      </div>

      <div class="card">
        <div class="text-sm font-bold text-accent mb-2">03</div>
        <h3 class="font-bold text-lg mb-2 text-warm-gray-900">Join</h3>
        <p class="text-warm-gray-600 text-sm">
          Meet the bike train at any point along the route
        </p>
      </div>
    </div>
  </div>
</div>
