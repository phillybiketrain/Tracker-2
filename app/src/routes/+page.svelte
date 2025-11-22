<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';

  let rides = [];
  let routes = []; // Grouped by route
  let loading = true;
  let filter = 'week'; // today | tomorrow | week
  let openOverlay = null; // Track which route overlay is open

  function toggleOverlay(routeId) {
    if (openOverlay === routeId) {
      openOverlay = null;
    } else {
      openOverlay = routeId;
    }
  }

  function closeOverlay() {
    openOverlay = null;
  }

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
  <title>Philly Bike Train - Fixed-Route Bike Transit</title>
</svelte:head>

<svelte:window on:click={() => { if (openOverlay) closeOverlay(); }} />

<div class="container mx-auto px-6 py-8">

  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-4xl font-bold mb-6 text-warm-gray-900">Browse Routes</h1>

    <!-- Filters -->
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
  </div>

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
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each routes as route (route.id)}
        {@const nextRide = route.rides[0]}
        {@const hasMore = route.rides.length > 1}
        {@const isOpen = openOverlay === route.id}

        <div class="card hover:shadow-md transition-all bg-white relative">
          <!-- Action Buttons - Top Right -->
          <div class="absolute top-4 right-4 flex gap-2">
            {#if nextRide.status === 'live'}
              <a href="/ride/{nextRide.id}" class="btn btn-primary text-xs px-3 py-1">
                Track Live
              </a>
            {:else}
              <button on:click={() => expressInterest(nextRide.id)} class="btn btn-secondary text-xs px-3 py-1">
                Interested
              </button>
              <a href="/ride/{nextRide.id}" class="btn btn-primary text-xs px-3 py-1">
                Details
              </a>
            {/if}
          </div>

          <!-- Route Name -->
          <div class="mb-4 pr-32">
            <h3 class="text-lg font-bold text-warm-gray-900">{route.name}</h3>
          </div>

          <!-- Departure Info -->
          <div class="flex items-center gap-3 text-sm text-warm-gray-900 mb-4">
            <div class="font-medium">{formatTime(route.departure_time)}</div>
            {#if route.estimated_duration}
              <div class="text-warm-gray-400">•</div>
              <div class="text-warm-gray-600">{route.estimated_duration}</div>
            {/if}
          </div>

          <!-- Next Ride Date -->
          <div class="mb-2">
            <div class="flex items-center gap-2 mb-2">
              {#if nextRide.status === 'live'}
                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              {:else}
                <div class="w-2 h-2 bg-warm-gray-300 rounded-full"></div>
              {/if}
              <div class="text-sm font-medium text-warm-gray-900">{formatDate(nextRide.date)}</div>
            </div>

            {#if hasMore}
              <div class="relative ml-4">
                <button
                  on:click|stopPropagation={() => toggleOverlay(route.id)}
                  class="text-sm text-warm-gray-600 hover:text-warm-gray-900 flex items-center gap-1"
                >
                  +{route.rides.length - 1} more
                  <svg class="w-3 h-3 transition-transform {isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <!-- Overlay Tooltip -->
                {#if isOpen}
                  <div class="overlay-tooltip" on:click|stopPropagation>
                    <div class="space-y-2">
                      {#each route.rides.slice(1) as ride (ride.id)}
                        <div class="text-sm text-warm-gray-900">
                          {formatDate(ride.date)}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- View Route Link -->
          {#if route.waypoints && route.waypoints.length > 0}
            <a
              href="/ride/{nextRide.id}"
              class="mt-4 pt-4 border-t border-warm-gray-100 w-full text-sm text-warm-gray-600 hover:text-warm-gray-900 flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              View route
            </a>
          {/if}
        </div>
      {/each}
    </div>

    <p class="text-center text-warm-gray-500 mt-8 text-sm">
      Showing {routes.length} route{routes.length !== 1 ? 's' : ''} with {rides.length} upcoming ride{rides.length !== 1 ? 's' : ''}
    </p>
  {/if}

</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .overlay-tooltip {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.5rem;
    background: white;
    border: 1px solid #EDEAE5;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 10;
    min-width: 150px;
    animation: tooltipSlide 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes tooltipSlide {
    0% {
      opacity: 0;
      transform: translateY(-8px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
