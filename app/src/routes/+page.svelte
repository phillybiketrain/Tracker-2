<script>
  import { API_URL } from '$lib/config.js';
  import RoutePreview from '$lib/components/RoutePreview.svelte';
  import { onMount } from 'svelte';

  let rides = [];
  let routes = []; // Grouped by route
  let loading = true;
  let featuredRoutes = []; // Top 5 routes for hero section
  let currentPage = 1;
  let pageSize = 9;
  let totalRoutes = 0;

  async function loadRides() {
    loading = true;

    try {
      const fromStr = new Date().toISOString().split('T')[0];
      const res = await fetch(`${API_URL}/rides?from_date=${fromStr}&days=30&limit=500`);
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

        // Get featured routes (top 5 for hero)
        featuredRoutes = allRoutes.slice(0, 5);

        // Paginate remaining routes
        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        routes = allRoutes.slice(startIdx, endIdx);
      }

    } catch (error) {
      console.error('Error loading rides:', error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadRides();
  });

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

  function goToPage(page) {
    currentPage = page;
    loadRides();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $: totalPages = Math.ceil(totalRoutes / pageSize);
  $: pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
</script>

<svelte:head>
  <title>Philly Bike Train - Safer | Social | More Fun</title>
</svelte:head>

<!-- Hero Section -->
<div class="bg-gradient-to-br from-primary to-blue-700 text-white">
  <div class="container mx-auto px-6 py-20">
    <div class="max-w-3xl mx-auto text-center">
      <h1 class="text-5xl md:text-6xl font-bold mb-6">Safer | Social | More Fun</h1>
      <p class="text-2xl mb-4 text-blue-100">It's a bike bus for commuters!</p>
      <p class="text-lg mb-8 text-blue-50 max-w-2xl mx-auto">
        Join an organized group ride where participants can hop on at designated stops along the route,
        just like traditional transit. Ride together, arrive together.
      </p>
      <div class="flex gap-4 justify-center flex-wrap">
        <a href="/live" class="btn bg-white text-primary hover:bg-blue-50 text-lg px-8 py-4">
          Track Live Rides
        </a>
        <a href="/create" class="btn bg-blue-600 hover:bg-blue-500 text-white border-2 border-white text-lg px-8 py-4">
          Create a Route
        </a>
      </div>
    </div>
  </div>
</div>

<!-- Featured Routes Section -->
{#if !loading && featuredRoutes.length > 0}
  <div class="bg-warm-gray-50 py-16">
    <div class="container mx-auto px-6">
      <h2 class="text-3xl font-bold mb-8 text-warm-gray-900 text-center">Regular Service Routes</h2>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {#each featuredRoutes as route}
          {@const nextRide = route.rides[0]}
          <a href="/ride/{nextRide.id}" class="card hover:shadow-lg transition-all bg-white p-0 overflow-hidden">
            <!-- Route Map Preview -->
            {#if route.waypoints && route.waypoints.length > 0}
              <div class="h-48 w-full overflow-hidden">
                <RoutePreview waypoints={route.waypoints} previewImageUrl={route.preview_image_url} />
              </div>
            {/if}

            <div class="p-6">
              <h3 class="text-xl font-bold text-warm-gray-900 mb-3">{route.name}</h3>
              {#if route.description}
                <p class="text-sm text-warm-gray-600 mb-4 line-clamp-2">{route.description}</p>
              {/if}
              <div class="flex items-center gap-3 text-sm text-warm-gray-700">
                <span class="font-medium">{formatTime(route.departure_time)}</span>
                {#if route.estimated_duration}
                  <span class="text-warm-gray-400">•</span>
                  <span>{route.estimated_duration}</span>
                {/if}
              </div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- All Routes Section -->
<div class="container mx-auto px-6 py-16">
  <h2 class="text-3xl font-bold mb-8 text-warm-gray-900 text-center">All Upcoming Rides</h2>

  <!-- Loading State -->
  {#if loading}
    <div class="text-center py-16">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-warm-gray-600 text-lg">Loading rides...</p>
    </div>

  <!-- Empty State -->
  {:else if routes.length === 0}
    <div class="card text-center py-16 max-w-md mx-auto">
      <h2 class="text-3xl font-bold mb-3 text-warm-gray-900">No more rides scheduled</h2>
      <p class="text-warm-gray-600 mb-8 text-lg">
        Check back soon for new rides, or create your own route!
      </p>
      <a href="/create" class="btn btn-primary inline-block">
        Create a Route
      </a>
    </div>

  <!-- Routes List -->
  {:else}
    <div class="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {#each routes as route (route.id)}
        {@const nextRide = route.rides[0]}

        <a href="/ride/{nextRide.id}" class="card hover:shadow-md transition-all bg-white relative block cursor-pointer p-0 overflow-hidden">
          {#if nextRide.status === 'live'}
            <!-- Live Badge -->
            <div class="absolute top-4 right-4 z-10">
              <span class="bg-green-500 text-white text-xs px-3 py-1 rounded-full shadow-lg font-medium flex items-center gap-1">
                <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                LIVE
              </span>
            </div>
          {/if}

          <!-- Route Map Preview -->
          {#if route.waypoints && route.waypoints.length > 0}
            <div class="h-40 w-full overflow-hidden">
              <RoutePreview waypoints={route.waypoints} previewImageUrl={route.preview_image_url} />
            </div>
          {/if}

          <div class="p-6">
            <h3 class="text-lg font-bold text-warm-gray-900 mb-2">{route.name}</h3>

            <div class="flex items-center gap-3 text-sm text-warm-gray-700 mb-3">
              <span class="font-medium">{formatTime(route.departure_time)}</span>
              {#if route.estimated_duration}
                <span class="text-warm-gray-400">•</span>
                <span>{route.estimated_duration}</span>
              {/if}
            </div>

            <div class="text-sm font-medium text-primary">
              Next: {formatDate(nextRide.date)}
            </div>

            {#if route.rides.length > 1}
              <div class="text-xs text-warm-gray-500 mt-1">
                +{route.rides.length - 1} more date{route.rides.length - 1 !== 1 ? 's' : ''}
              </div>
            {/if}
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
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
