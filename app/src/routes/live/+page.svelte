<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';
  import Map from '$lib/components/Map.svelte';

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
      <div class="flex items-center gap-3 mb-2">
        <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
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
        <a href="/" class="btn btn-primary inline-block">
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
              class="w-full text-left card hover:shadow-md transition-all {selectedRide?.id === ride.id ? 'ring-2 ring-primary' : ''}"
            >
              <div class="flex items-start justify-between mb-2">
                <h3 class="font-bold text-warm-gray-900 pr-2">{ride.route_name}</h3>
                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0 mt-1"></div>
              </div>

              <div class="text-sm text-warm-gray-600 mb-3">
                Departed at {formatTime(ride.departure_time)}
              </div>

              <a
                href="/ride/{ride.id}"
                on:click|stopPropagation
                class="btn btn-primary text-xs w-full"
              >
                Track This Ride
              </a>
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
          <div class="card">
            <div class="flex items-start justify-between mb-2">
              <h3 class="font-bold text-warm-gray-900 pr-2">{ride.route_name}</h3>
              <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0 mt-1"></div>
            </div>

            {#if ride.route_description}
              <p class="text-sm text-warm-gray-600 mb-3">{ride.route_description}</p>
            {/if}

            <div class="text-sm text-warm-gray-600 mb-4">
              Departed at {formatTime(ride.departure_time)}
            </div>

            <a
              href="/ride/{ride.id}"
              class="btn btn-primary w-full"
            >
              Track This Ride
            </a>
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>
