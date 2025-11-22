<script>
  import { onMount } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { API_URL } from '$lib/config.js';

  let rides = [];
  let routes = []; // Grouped by route
  let loading = true;
  let filter = 'week'; // today | tomorrow | week
  let showMap = false;

  onMount(() => {
    loadRides();
  });

  async function loadRides() {
    loading = true;

    try {
      let fromDate = new Date();
      let days = 1;

      if (filter === 'tomorrow') {
        fromDate.setDate(fromDate.getDate() + 1);
        days = 1;
      } else if (filter === 'week') {
        days = 7;
      }

      const fromStr = fromDate.toISOString().split('T')[0];

      const res = await fetch(
        `${API_URL}/api/rides?from_date=${fromStr}&days=${days}&limit=50`
      );

      const data = await res.json();

      if (data.success) {
        rides = data.data;

        // Group rides by route
        const routeMap = new Map();
        rides.forEach(ride => {
          const routeId = ride.route_id;
          if (!routeMap.has(routeId)) {
            routeMap.set(routeId, {
              id: routeId,
              name: ride.route_name,
              description: ride.route_description,
              access_code: ride.access_code,
              waypoints: ride.waypoints,
              departure_time: ride.departure_time,
              estimated_duration: ride.estimated_duration,
              rides: []
            });
          }
          routeMap.get(routeId).rides.push(ride);
        });

        routes = Array.from(routeMap.values());
      }

    } catch (error) {
      console.error('Error loading rides:', error);
      alert('Failed to load rides');
    } finally {
      loading = false;
    }
  }

  async function expressInterest(rideId) {
    try {
      // Generate simple session ID
      let sessionId = localStorage.getItem('session_id');
      if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('session_id', sessionId);
      }

      const res = await fetch(
        `${API_URL}/api/rides/${rideId}/interest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        }
      );

      const data = await res.json();

      if (data.success) {
        loadRides(); // Reload to show updated count
      }

    } catch (error) {
      console.error('Error expressing interest:', error);
    }
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
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

  $: {
    // Reload rides when filter changes
    loadRides();
  }
</script>

<svelte:head>
  <title>Browse Rides - Philly Bike Train</title>
</svelte:head>

<div class="container mx-auto px-6 py-8">

  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-4xl font-bold mb-6 text-warm-gray-900">Browse Routes</h1>

    <!-- Filters and View Toggle -->
    <div class="flex items-center justify-between">
      <div class="flex gap-3">
        <button
          on:click={() => filter = 'today'}
          class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'today' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
        >
          Today
        </button>
        <button
          on:click={() => filter = 'tomorrow'}
          class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'tomorrow' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
        >
          Tomorrow
        </button>
        <button
          on:click={() => filter = 'week'}
          class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'week' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
        >
          This Week
        </button>
      </div>

      <button
        on:click={() => showMap = !showMap}
        class="px-6 py-3 rounded-2xl font-medium transition-all bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200"
      >
        {showMap ? 'Hide Map' : 'Show Map'}
      </button>
    </div>
  </div>

  <!-- Map View -->
  {#if showMap && routes.length > 0}
    <div class="card mb-8 p-0 overflow-hidden">
      <div class="h-[500px]">
        <Map waypoints={routes.flatMap(r => r.waypoints || [])} showRoute={false} />
      </div>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="text-center py-16">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-warm-gray-600 text-lg">Loading rides...</p>
    </div>

  <!-- Empty State -->
  {:else if routes.length === 0}
    <div class="card text-center py-16 max-w-md mx-auto">
      <h2 class="text-3xl font-bold mb-3 text-warm-gray-900">No rides scheduled</h2>
      <p class="text-warm-gray-600 mb-8 text-lg">
        Be the first to create a bike train!
      </p>
      <a href="/lead" class="btn btn-primary inline-block">
        Create a Route
      </a>
    </div>

  <!-- Routes List -->
  {:else}
    <div class="space-y-6">
      {#each routes as route (route.id)}
        <div class="card hover:shadow-md transition-all bg-white">
          <!-- Route Header -->
          <div class="mb-4">
            <h3 class="text-2xl font-bold text-warm-gray-900 mb-2">{route.name}</h3>
            {#if route.description}
              <p class="text-warm-gray-600">{route.description}</p>
            {/if}
          </div>

          <!-- Route Info -->
          <div class="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-warm-gray-100">
            <div>
              <div class="text-xs text-warm-gray-500 mb-1">Departure</div>
              <div class="font-medium text-warm-gray-900">{formatTime(route.departure_time)}</div>
            </div>
            <div>
              <div class="text-xs text-warm-gray-500 mb-1">Duration</div>
              <div class="font-medium text-warm-gray-900">{route.estimated_duration || '—'}</div>
            </div>
            <div>
              <div class="text-xs text-warm-gray-500 mb-1">Waypoints</div>
              <div class="font-medium text-warm-gray-900">{route.waypoints?.length || 0}</div>
            </div>
          </div>

          <!-- Upcoming Rides -->
          <div class="mb-4">
            <h4 class="text-sm font-semibold text-warm-gray-700 mb-3">Upcoming Rides</h4>
            <div class="space-y-2">
              {#each route.rides as ride (ride.id)}
                <div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-warm-gray-50 transition-colors">
                  <div class="flex items-center gap-3">
                    {#if ride.status === 'live'}
                      <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    {:else}
                      <div class="w-2 h-2 bg-warm-gray-300 rounded-full"></div>
                    {/if}
                    <div>
                      <div class="font-medium text-warm-gray-900">{formatDate(ride.date)}</div>
                      <div class="text-xs text-warm-gray-600">
                        {#if ride.follower_count > 0 || ride.interest_count > 0}
                          {ride.follower_count} following • {ride.interest_count} interested
                        {:else}
                          No followers yet
                        {/if}
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    {#if ride.status === 'live'}
                      <a href="/ride/{ride.id}" class="btn btn-primary text-sm px-4 py-2">
                        Track Live
                      </a>
                    {:else}
                      <button on:click={() => expressInterest(ride.id)} class="btn btn-secondary text-sm px-4 py-2">
                        Interested
                      </button>
                      <a href="/ride/{ride.id}" class="btn btn-primary text-sm px-4 py-2">
                        Details
                      </a>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <p class="text-center text-warm-gray-500 mt-8 text-sm">
      Showing {routes.length} route{routes.length !== 1 ? 's' : ''} with {rides.length} upcoming ride{rides.length !== 1 ? 's' : ''}
    </p>
  {/if}

</div>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
