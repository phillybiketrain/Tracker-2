<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';
  import RoutePreview from '$lib/components/RoutePreview.svelte';

  let rides = [];
  let routes = []; // Grouped by route
  let loading = true;
  let filter = 'week'; // today | tomorrow | week | all
  let openOverlay = null; // Track which route overlay is open
  let currentPage = 1;
  let pageSize = 12;
  let totalRoutes = 0;

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
      } else if (filter === 'all') {
        days = 365; // Load all upcoming rides for the year
      }

      const fromStr = fromDate.toISOString().split('T')[0];

      const res = await fetch(
        `${API_URL}/rides?from_date=${fromStr}&days=${days}&limit=500`
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
              preview_image_url: ride.preview_image_url,
              rides: []
            });
          }
          routeMap.get(routeId).rides.push(ride);
        });

        const allRoutes = Array.from(routeMap.values());
        totalRoutes = allRoutes.length;

        // Paginate routes
        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        routes = allRoutes.slice(startIdx, endIdx);
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
        `${API_URL}/rides/${rideId}/interest`,
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
    // Reset to page 1 and reload rides when filter changes
    currentPage = 1;
    loadRides();
  }

  function goToPage(page) {
    currentPage = page;
    loadRides();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $: totalPages = Math.ceil(totalRoutes / pageSize);
  $: pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
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
    <div class="flex gap-3 flex-wrap">
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
      <button
        on:click={() => filter = 'all'}
        class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
      >
        All Rides
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

        <a href="/ride/{nextRide.id}" class="card hover:shadow-md transition-all bg-white relative block cursor-pointer p-0">
          <!-- Route Map Preview -->
          {#if route.waypoints && route.waypoints.length > 0}
            <div class="h-32 w-full overflow-hidden">
              <RoutePreview waypoints={route.waypoints} previewImageUrl={route.preview_image_url} />
            </div>
          {/if}

          <!-- Card Content -->
          <div class="p-6">
            {#if nextRide.status === 'live'}
              <!-- Live Badge - Top Right -->
              <div class="absolute top-4 right-4 z-10">
                <span class="btn btn-primary text-xs px-3 py-1 pointer-events-none shadow-md">
                  Track Live
                </span>
              </div>
            {/if}

            <!-- Route Name -->
            <div class="mb-3">
              <h3 class="text-lg font-bold text-warm-gray-900">{route.name}</h3>
            </div>

            <!-- Departure Info -->
            <div class="flex items-center gap-3 text-sm text-warm-gray-900 mb-3">
              <div class="font-medium">{formatTime(route.departure_time)}</div>
              {#if route.estimated_duration}
                <div class="text-warm-gray-400">•</div>
                <div class="text-warm-gray-600">{route.estimated_duration}</div>
              {/if}
            </div>

            <!-- Next Ride Date -->
            <div class="flex items-center gap-2">
              {#if nextRide.status === 'live'}
                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              {/if}
              <div class="text-sm font-medium text-warm-gray-900">{formatDate(nextRide.date)}</div>

              {#if hasMore}
                <div class="relative">
                  <button
                    on:click|preventDefault|stopPropagation={() => toggleOverlay(route.id)}
                    class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warm-gray-100 hover:bg-warm-gray-200 transition-colors"
                    title="{route.rides.length - 1} more ride{route.rides.length - 1 !== 1 ? 's' : ''}"
                  >
                    <svg class="w-3 h-3 text-warm-gray-700 transition-transform {isOpen ? 'rotate-45' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
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
          </div>
        </a>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="mt-12 flex justify-center items-center gap-2">
        <button
          on:click={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          class="px-4 py-2 rounded-lg border border-warm-gray-200 text-warm-gray-700 hover:bg-warm-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Previous
        </button>

        <div class="flex gap-1">
          {#each pageNumbers as pageNum}
            {#if pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)}
              <button
                on:click={() => goToPage(pageNum)}
                class="w-10 h-10 rounded-lg font-medium transition-all {currentPage === pageNum ? 'bg-primary text-white' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
              >
                {pageNum}
              </button>
            {:else if pageNum === currentPage - 3 || pageNum === currentPage + 3}
              <span class="w-10 h-10 flex items-center justify-center text-warm-gray-400">...</span>
            {/if}
          {/each}
        </div>

        <button
          on:click={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          class="px-4 py-2 rounded-lg border border-warm-gray-200 text-warm-gray-700 hover:bg-warm-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Next
        </button>
      </div>
    {/if}

    <p class="text-center text-warm-gray-500 mt-6 text-sm">
      Showing {routes.length} of {totalRoutes} route{totalRoutes !== 1 ? 's' : ''}
      {#if totalPages > 1}
        (Page {currentPage} of {totalPages})
      {/if}
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
    z-index: 50;
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
