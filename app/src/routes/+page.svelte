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
              start_location_icon_url: ride.start_location_icon_url,
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

<!-- Hero Section 1: Main Message -->
<div class="bg-white">
  <div class="container mx-auto px-6 py-16">
    <div class="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
      <!-- Left: Text Content -->
      <div>
        <p class="text-xl mb-4 text-primary font-medium">Safer | Social | More Fun</p>
        <h1 class="text-4xl md:text-5xl font-bold mb-6 text-gray-900 leading-tight">
          It's a bike bus for commuters!
        </h1>
        <p class="text-lg text-gray-700 mb-4 leading-relaxed">
          The Philly Bike Train is an organized group bike ride for commuting to work, school, or another common destination.
        </p>
        <p class="text-lg text-gray-700 mb-4 leading-relaxed">
          We leave at a set time from the start, and you can join at the start or anywhere along the way, just like a regular bus or train. Use the tracker to catch the ride as is passes nearby you!
        </p>
        <p class="text-lg text-gray-700 mb-4 leading-relaxed">
          Bike buses are a more fun, social, and safe commute.
        </p>
        <p class="text-xl font-semibold text-gray-900 mb-8">
          Ride with us to get where you're going
        </p>
        <div class="flex gap-4 flex-wrap">
          <a href="/live" class="btn btn-primary text-lg px-8 py-4">
            Track Live Rides
          </a>
          <a href="/browse" class="btn btn-secondary text-lg px-8 py-4">
            Browse All Rides
          </a>
        </div>
      </div>

      <!-- Right: Image Placeholder -->
      <div class="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl h-96 flex items-center justify-center shadow-lg">
        <div class="text-center text-blue-600">
          <svg class="w-24 h-24 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="text-sm font-medium">Hero Image</p>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Hero Section 2: About the Tracker -->
<div class="bg-warm-gray-50">
  <div class="container mx-auto px-6 py-16">
    <div class="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
      <!-- Left: Image Placeholder -->
      <div class="bg-gradient-to-br from-green-100 to-green-200 rounded-2xl h-96 flex items-center justify-center shadow-lg order-2 md:order-1">
        <div class="text-center text-green-600">
          <svg class="w-24 h-24 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p class="text-sm font-medium">Group Ride Image</p>
        </div>
      </div>

      <!-- Right: Text Content -->
      <div class="order-1 md:order-2">
        <h2 class="text-4xl font-bold mb-6 text-gray-900">About the Tracker</h2>
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">
          Use our live tracker to catch the bike train as it passes near you! Watch live on your phone (no account needed) as the train approaches and hop on as it passes by.
        </p>
        <p class="text-lg text-gray-700 mb-8 leading-relaxed">
          Whether you're commuting to work, heading to school, or just exploring the city,
          the Philly Bike Train makes cycling safer and more social.
        </p>
        <a href="/live" class="btn btn-primary text-lg px-8 py-4 inline-block">
          Use the Tracker
        </a>
      </div>
    </div>
  </div>
</div>

<!-- Regular Service Routes Section -->
{#if !loading && featuredRoutes.length > 0}
  <div class="bg-white py-16">
    <div class="container mx-auto px-6">
      <h2 class="text-4xl font-bold mb-4 text-gray-900 text-center">Regular Service Routes</h2>
      <p class="text-center text-gray-600 mb-12 text-lg max-w-2xl mx-auto">
        Fixed routes with regular schedules. Click to see the next ride and track live!
      </p>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {#each featuredRoutes as route}
          {@const nextRide = route.rides[0]}
          <div class="bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-primary transition-all hover:shadow-lg">
            <!-- Route Image/Map Preview -->
            {#if route.waypoints && route.waypoints.length > 0}
              <div class="h-64 w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                <RoutePreview waypoints={route.waypoints} previewImageUrl={route.preview_image_url} />
              </div>
            {:else}
              <div class="h-64 w-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center">
                <div class="text-center text-orange-600">
                  <svg class="w-16 h-16 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <p class="text-sm font-medium">Route Photo</p>
                </div>
              </div>
            {/if}

            <!-- Route Info -->
            <div class="p-6">
              <div class="flex items-center gap-3 mb-3">
                {#if route.start_location_icon_url}
                  <img src="{route.start_location_icon_url}" alt="Route icon" class="w-10 h-10 object-contain rounded" />
                {/if}
                <h3 class="text-2xl font-bold text-gray-900">{route.name}</h3>
              </div>
              {#if route.description}
                <p class="text-gray-600 mb-4 text-sm leading-relaxed line-clamp-2">{route.description}</p>
              {/if}

              <div class="space-y-2 mb-6">
                <div class="flex items-center gap-2 text-gray-700">
                  <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="font-medium">{formatTime(route.departure_time)}</span>
                  {#if route.estimated_duration}
                    <span class="text-gray-400">•</span>
                    <span class="text-gray-600">{route.estimated_duration}</span>
                  {/if}
                </div>

                <div class="flex items-center gap-2 text-gray-700">
                  <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span class="font-medium">Next: {formatDate(nextRide.date)}</span>
                </div>
              </div>

              <a
                href="/ride/{nextRide.id}"
                class="block text-center bg-primary hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                View Next Ride →
              </a>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Photos Section -->
<div class="bg-warm-gray-50 py-16">
  <div class="container mx-auto px-6">
    <h2 class="text-4xl font-bold mb-4 text-gray-900 text-center">Photos</h2>
    <p class="text-center text-gray-600 mb-12 text-lg max-w-2xl mx-auto">
      Snapshots from our community rides throughout the year
    </p>

    <div class="max-w-6xl mx-auto">
      <!-- Season Grid -->
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <!-- Winter -->
        <div class="group">
          <div class="bg-gradient-to-br from-blue-200 to-blue-300 rounded-xl h-64 flex items-center justify-center overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
            <div class="text-center text-blue-700">
              <svg class="w-20 h-20 mx-auto mb-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p class="text-lg font-bold">Winter</p>
            </div>
          </div>
        </div>

        <!-- Spring -->
        <div class="group">
          <div class="bg-gradient-to-br from-green-200 to-green-300 rounded-xl h-64 flex items-center justify-center overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
            <div class="text-center text-green-700">
              <svg class="w-20 h-20 mx-auto mb-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p class="text-lg font-bold">Spring</p>
            </div>
          </div>
        </div>

        <!-- Summer -->
        <div class="group">
          <div class="bg-gradient-to-br from-yellow-200 to-yellow-300 rounded-xl h-64 flex items-center justify-center overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
            <div class="text-center text-yellow-700">
              <svg class="w-20 h-20 mx-auto mb-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p class="text-lg font-bold">Summer</p>
            </div>
          </div>
        </div>

        <!-- Fall -->
        <div class="group">
          <div class="bg-gradient-to-br from-orange-200 to-orange-300 rounded-xl h-64 flex items-center justify-center overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
            <div class="text-center text-orange-700">
              <svg class="w-20 h-20 mx-auto mb-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <p class="text-lg font-bold">Fall</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Special Events -->
      <div class="bg-gradient-to-br from-purple-200 to-purple-300 rounded-xl h-80 flex items-center justify-center overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
        <div class="text-center text-purple-700">
          <svg class="w-24 h-24 mx-auto mb-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <p class="text-2xl font-bold">Special Events</p>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Contact/Footer Section -->
<div class="bg-gray-900 text-white py-12">
  <div class="container mx-auto px-6 text-center">
    <h3 class="text-2xl font-bold mb-6">Get Involved</h3>
    <p class="text-gray-300 mb-6 max-w-2xl mx-auto">
      Join our community! Follow us on social media or reach out with questions.
    </p>
    <div class="flex gap-4 justify-center flex-wrap">
      <a href="mailto:phillybiketrain@gmail.com" class="text-blue-400 hover:text-blue-300 font-medium">
        phillybiketrain@gmail.com
      </a>
      <span class="text-gray-500">•</span>
      <a href="https://instagram.com/phillybiketrain" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 font-medium">
        @phillybiketrain
      </a>
    </div>
  </div>
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
