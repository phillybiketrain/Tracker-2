<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';
  import Map from '$lib/components/Map.svelte';
  import RoutePreview from '$lib/components/RoutePreview.svelte';

  let liveRides = [];
  let loading = true;
  let selectedRide = null;

  onMount(() => {
    loadLiveRides();
    // Refresh every 10 seconds
    const interval = setInterval(loadLiveRides, 10000);
    return () => clearInterval(interval);
  });

  async function loadLiveRides() {
    try {
      const res = await fetch(`${API_URL}/rides/live`);
      const data = await res.json();

      if (data.success) {
        liveRides = data.data;
        // Auto-select first ride if none selected
        if (liveRides.length > 0 && !selectedRide) {
          selectedRide = liveRides[0];
        }
      }
    } catch (error) {
      console.error('Error loading live rides:', error);
    } finally {
      loading = false;
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
      <div class="flex items-center gap-3 mb-2">
        <div class="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
        <h1 class="text-4xl font-bold text-warm-gray-900">Live Rides</h1>
      </div>
      <p class="text-warm-gray-600 text-lg">Track bike trains happening right now</p>
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
      <!-- Desktop: Map + Sidebar -->
      <div class="hidden md:grid md:grid-cols-3 gap-6">
        <!-- Map -->
        <div class="md:col-span-2">
          <div class="h-[600px] rounded-2xl overflow-hidden border border-warm-gray-200">
            <Map
              waypoints={selectedRide?.waypoints || []}
              leaderLocation={selectedRide ? { lat: 39.9526, lng: -75.1652 } : null}
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

      <!-- Mobile: List Only -->
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

  </div>
</div>
