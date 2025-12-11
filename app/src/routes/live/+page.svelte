<script>
  import { onMount, onDestroy } from 'svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';
  import Map from '$lib/components/Map.svelte';
  import RoutePreview from '$lib/components/RoutePreview.svelte';

  let liveRides = [];
  let loading = true;
  let selectedRide = null;

  // Watch All mode
  let watchingAll = false;
  let socket = null;
  let mapComponent;
  let pollInterval = null;

  // Transform rides for multi-ride map mode
  $: ridesForMap = liveRides.map(ride => ({
    accessCode: ride.access_code,
    routeName: ride.route_name,
    waypoints: ride.waypoints || [],
    leaderLocation: ride.current_location || null,
    locationTrail: ride.location_trail || []
  }));

  onMount(() => {
    loadLiveRides();
    // Refresh every 10 seconds when not watching all
    pollInterval = setInterval(() => {
      if (!watchingAll) {
        loadLiveRides();
      }
    }, 10000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
    stopWatchingAll();
  });

  async function loadLiveRides() {
    try {
      const res = await fetch(`${API_URL}/rides/live`);
      const data = await res.json();

      if (data.success) {
        liveRides = data.data;
        // Auto-select first ride if none selected (single ride mode)
        if (liveRides.length > 0 && !selectedRide && !watchingAll) {
          selectedRide = liveRides[0];
        }
      }
    } catch (error) {
      console.error('Error loading live rides:', error);
    } finally {
      loading = false;
    }
  }

  function startWatchingAll() {
    if (watchingAll) return;

    watchingAll = true;
    selectedRide = null;

    // Connect to WebSocket
    socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('Connected to server for Watch All');
      socket.emit('watch:all');
    });

    socket.on('watch:all:joined', (data) => {
      console.log(`Watching ${data.rides.length} live rides:`, data.rides);
    });

    // Listen for location updates from all rides
    socket.on('location:updated', (data) => {
      const { accessCode, lat, lng, timestamp } = data;

      // Update the ride's leader location
      liveRides = liveRides.map(ride => {
        if (ride.access_code === accessCode) {
          // Update current location
          ride.current_location = { lat, lng, timestamp };

          // Append to location trail
          if (!ride.location_trail) ride.location_trail = [];
          ride.location_trail = [...ride.location_trail, { lat, lng, timestamp }];
        }
        return ride;
      });

      // Also update the marker directly for smoother animation
      if (mapComponent) {
        mapComponent.updateRideLeader(accessCode, { lat, lng });
      }
    });

    socket.on('ride:ended', ({ accessCode }) => {
      console.log(`Ride ${accessCode} ended`);
      // Remove from live rides list
      liveRides = liveRides.filter(r => r.access_code !== accessCode);
    });
  }

  function stopWatchingAll() {
    if (!watchingAll) return;

    watchingAll = false;

    if (socket) {
      socket.emit('watch:all:stop');
      socket.disconnect();
      socket = null;
    }

    // Resume polling
    loadLiveRides();
  }

  function toggleWatchAll() {
    if (watchingAll) {
      stopWatchingAll();
    } else {
      startWatchingAll();
    }
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }
</script>

<svelte:head>
  <title>Live Rides - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-8">

    <!-- Header -->
    <div class="mb-8">
      <a href="/browse" class="text-primary hover:text-secondary font-medium mb-3 inline-block">← Back to Browse</a>
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
          <h1 class="text-4xl font-bold text-warm-gray-900">Live Rides</h1>
        </div>
        {#if liveRides.length > 0}
          <button
            on:click={toggleWatchAll}
            class="px-4 py-2 rounded-lg font-medium transition-all {watchingAll
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-white text-warm-gray-700 border border-warm-gray-300 hover:bg-warm-gray-50'}"
          >
            {watchingAll ? '● Watching All' : 'Watch All'}
          </button>
        {/if}
      </div>
      <p class="text-warm-gray-600 text-lg">
        {#if watchingAll}
          Real-time tracking of all {liveRides.length} active ride{liveRides.length !== 1 ? 's' : ''}
        {:else}
          Track bike trains happening right now
        {/if}
      </p>
    </div>

    {#if loading}
      <div class="text-center py-16">
        <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-warm-gray-600 text-lg">Loading live rides...</p>
      </div>

    {:else if liveRides.length === 0}
      <!-- Empty State -->
      <div class="card text-center py-16 max-w-md mx-auto">
        <div class="text-6xl mb-4">🚴</div>
        <h2 class="text-3xl font-bold mb-3 text-warm-gray-900">No rides active right now</h2>
        <p class="text-warm-gray-600 mb-8 text-lg">
          Check back soon or browse upcoming rides
        </p>
        <a href="/browse" class="btn btn-primary inline-block">
          Browse Upcoming Rides
        </a>
      </div>

    {:else}
      <!-- Watch All Mode: Full-width map -->
      {#if watchingAll}
        <div class="mb-6">
          <div class="h-[600px] rounded-2xl overflow-hidden border border-warm-gray-200">
            <Map
              bind:this={mapComponent}
              rides={ridesForMap}
            />
          </div>
          <div class="flex items-center justify-between mt-3">
            <p class="text-sm text-warm-gray-500">
              Showing {liveRides.length} active ride{liveRides.length !== 1 ? 's' : ''} with real-time tracking
            </p>
            <div class="flex items-center gap-4 text-xs text-warm-gray-500">
              <span class="flex items-center gap-1">
                <span class="w-4 h-0.5 bg-warm-gray-400" style="border-style: dashed;"></span>
                Planned route
              </span>
              <span class="flex items-center gap-1">
                <span class="w-4 h-0.5 bg-gradient-to-r from-green-500 via-blue-500 to-purple-500"></span>
                Path traveled
              </span>
            </div>
          </div>
        </div>

        <!-- Ride List Below Map -->
        <div class="grid md:grid-cols-3 gap-4">
          {#each liveRides as ride (ride.id)}
            <a href="/ride/{ride.id}" class="card hover:shadow-md transition-all p-0 overflow-hidden block">
              {#if ride.waypoints && ride.waypoints.length > 0}
                <div class="h-24 w-full overflow-hidden relative">
                  <RoutePreview waypoints={ride.waypoints} previewImageUrl={ride.preview_image_url} />
                  <div class="absolute top-2 right-2">
                    <div class="flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full">
                      <div class="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      LIVE
                    </div>
                  </div>
                </div>
              {/if}
              <div class="p-3">
                <h3 class="font-bold text-warm-gray-900 text-sm mb-1">{ride.route_name}</h3>
                <div class="flex items-center gap-2 text-xs text-warm-gray-600">
                  <span>{formatTime(ride.departure_time)}</span>
                  {#if ride.distance_miles}
                    <span>•</span>
                    <span>{ride.distance_miles} mi</span>
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        </div>

      <!-- Single Ride Mode: Map + Sidebar -->
      {:else}
      <div class="hidden md:grid md:grid-cols-3 gap-6">
        <!-- Map -->
        <div class="md:col-span-2">
          <div class="h-[600px] rounded-2xl overflow-hidden border border-warm-gray-200">
            <Map
              waypoints={selectedRide?.waypoints || []}
              leaderLocation={selectedRide?.current_location || null}
              locationTrail={selectedRide?.location_trail || []}
            />
          </div>
          <p class="text-sm text-warm-gray-500 mt-3">
            Select a ride to view its route on the map
          </p>
        </div>

        <!-- Sidebar List -->
        <div class="space-y-4">
          <h2 class="text-lg font-bold text-warm-gray-900">
            Active Now ({liveRides.length})
          </h2>

          {#each liveRides as ride (ride.id)}
            <button
              on:click={() => selectedRide = ride}
              class="w-full text-left card hover:shadow-md transition-all p-0 overflow-hidden {selectedRide?.id === ride.id ? 'ring-2 ring-green-500' : ''}"
            >
              <!-- Route Preview -->
              {#if ride.waypoints && ride.waypoints.length > 0}
                <div class="h-24 w-full overflow-hidden relative">
                  <RoutePreview waypoints={ride.waypoints} previewImageUrl={ride.preview_image_url} />
                  <div class="absolute top-2 right-2">
                    <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-lg"></div>
                  </div>
                </div>
              {/if}

              <div class="p-4">
                <h3 class="font-bold text-warm-gray-900 mb-2">{ride.route_name}</h3>

                <div class="flex items-center gap-2 text-xs text-warm-gray-600 mb-3">
                  <span>{formatTime(ride.departure_time)}</span>
                  {#if ride.distance_miles}
                    <span>•</span>
                    <span>{ride.distance_miles} mi</span>
                  {/if}
                  {#if ride.follower_count > 0}
                    <span>•</span>
                    <span>{ride.follower_count} tracking</span>
                  {/if}
                </div>

                <a
                  href="/ride/{ride.id}"
                  on:click|stopPropagation
                  class="btn btn-primary text-xs w-full"
                >
                  Track This Ride
                </a>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Mobile: List Only (when not watching all) -->
      <div class="md:hidden space-y-4">
        <h2 class="text-lg font-bold text-warm-gray-900">
          Active Now ({liveRides.length})
        </h2>

        {#each liveRides as ride (ride.id)}
          <a href="/ride/{ride.id}" class="card hover:shadow-md transition-all p-0 overflow-hidden block bg-gradient-to-br from-green-50 to-white border-2 border-green-500">
            <!-- Route Preview -->
            {#if ride.waypoints && ride.waypoints.length > 0}
              <div class="h-32 w-full overflow-hidden relative">
                <RoutePreview waypoints={ride.waypoints} previewImageUrl={ride.preview_image_url} />
                <div class="absolute top-3 right-3">
                  <div class="flex items-center gap-2 px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full shadow-lg">
                    <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    LIVE
                  </div>
                </div>
              </div>
            {/if}

            <div class="p-4">
              <h3 class="font-bold text-warm-gray-900 mb-2">{ride.route_name}</h3>

              {#if ride.route_description}
                <p class="text-sm text-warm-gray-600 mb-3 line-clamp-2">{ride.route_description}</p>
              {/if}

              <div class="flex items-center gap-2 text-sm text-warm-gray-600 mb-4">
                <span>{formatTime(ride.departure_time)}</span>
                {#if ride.distance_miles}
                  <span>•</span>
                  <span>{ride.distance_miles} mi</span>
                {/if}
                {#if ride.follower_count > 0}
                  <span>•</span>
                  <span>{ride.follower_count} tracking</span>
                {/if}
              </div>

              <div class="btn btn-primary w-full text-center">
                Track This Ride
              </div>
            </div>
          </a>
        {/each}
      </div>
      {/if}
    {/if}

  </div>
</div>
