<script>
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import Markdown from '$lib/components/Markdown.svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';

  let route = null;
  let nextRide = null;
  let otherRides = [];
  let loading = true;
  let notFound = false;

  // Live tracking state
  let tracking = false;
  let leaderLocation = null;
  let lastUpdate = null;
  let socket = null;
  let mapComponent;

  const slug = $page.params.slug;

  onMount(async () => {
    await loadRoute();
    timeInterval = setInterval(() => { lastUpdate = lastUpdate; }, 1000);
  });

  async function loadRoute() {
    loading = true;
    try {
      const res = await fetch(`${API_URL}/routes/by-slug/${slug}`);
      const data = await res.json();
      if (data.success) {
        route = data.data;
        nextRide = data.data.next_ride;
        otherRides = data.data.other_rides || [];
      } else {
        notFound = true;
      }
    } catch (error) {
      console.error('Error loading route:', error);
      notFound = true;
    } finally {
      loading = false;
    }
  }

  function parseLocalDate(dateStr) {
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  function formatDate(dateStr) {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }

  function startTracking() {
    if (!route || !nextRide) return;
    tracking = true;

    socket = io(SOCKET_URL);
    socket.on('connect', () => {
      socket.emit('follow:start', { accessCode: route.access_code });
    });
    socket.on('location:updated', (data) => {
      leaderLocation = { lat: data.lat, lng: data.lng, accuracy: data.accuracy };
      lastUpdate = new Date(data.timestamp);
    });
    socket.on('ride:ended', () => { stopTracking(); });
  }

  function stopTracking() {
    if (socket) {
      socket.emit('follow:stop', { accessCode: route.access_code });
      socket.disconnect();
    }
    tracking = false;
    leaderLocation = null;
  }

  function centerOnLeader() {
    if (mapComponent) mapComponent.centerOnLeader();
  }

  function getTimeSinceUpdate() {
    if (!lastUpdate) return 'Waiting for GPS...';
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  }

  let timeInterval;
  onDestroy(() => {
    if (socket) socket.disconnect();
    if (timeInterval) clearInterval(timeInterval);
  });

  $: isSpecial = route && route.tag === 'special';
  $: isLive = nextRide && nextRide.status === 'live';
</script>

<svelte:head>
  <title>{route?.name || 'Route'} - Philly Bike Train</title>
</svelte:head>

{#if loading}
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-warm-gray-600 text-lg">Loading...</p>
    </div>
  </div>

{:else if notFound}
  <div class="min-h-screen flex items-center justify-center">
    <div class="card text-center max-w-md py-12">
      <h2 class="text-3xl font-bold mb-4 text-warm-gray-900">Page Not Found</h2>
      <p class="text-warm-gray-600 mb-6">No route found at /{slug}</p>
      <a href="/browse" class="btn btn-primary">Browse Rides</a>
    </div>
  </div>

{:else if tracking}
  <!-- Live Tracking View -->
  <div class="fixed inset-0 flex flex-col bg-warm-gray-50">
    <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-warm-gray-200">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <h1 class="text-[1.125rem] font-bold text-warm-gray-900">Tracking Live</h1>
      </div>
      <div class="flex items-center gap-2">
        {#if leaderLocation}
          <button on:click={centerOnLeader} class="px-2 py-1 text-xs font-medium text-white bg-primary rounded">Center</button>
        {/if}
        <button on:click={stopTracking} class="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded">Stop</button>
      </div>
    </div>
    <div class="px-4 py-2 bg-white border-b border-warm-gray-200 flex items-center justify-between text-sm">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1.5">
          {#if lastUpdate && (Date.now() - lastUpdate.getTime()) < 30000}
            <div class="w-2 h-2 bg-green-500 rounded-full"></div>
            <span class="text-green-700 font-medium">Connected</span>
          {:else if lastUpdate}
            <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span class="text-yellow-700 font-medium">Waiting...</span>
          {:else}
            <div class="w-2 h-2 bg-gray-400 rounded-full"></div>
            <span class="text-warm-gray-500">Connecting...</span>
          {/if}
        </div>
        <span class="text-warm-gray-500">{getTimeSinceUpdate()}</span>
      </div>
      <span class="font-medium text-warm-gray-700 text-xs">{route.name}</span>
    </div>
    <div class="flex-1 relative">
      <Map bind:this={mapComponent} waypoints={route.waypoints || []} {leaderLocation} showMarkers={false} />
    </div>
  </div>

{:else}
  <!-- Route Page -->

  {#if isSpecial}
    <!-- Special Event Hero -->
    <div class="bg-gradient-to-b from-warm-gray-900 to-warm-gray-800 text-white">
      <div class="container mx-auto px-6 py-12 md:py-16">
        <div class="max-w-3xl mx-auto text-center">
          <div class="inline-block px-4 py-1 bg-amber-500 text-warm-gray-900 text-sm font-bold rounded-full mb-6">
            SPECIAL EVENT
          </div>
          <h1 class="text-4xl md:text-5xl font-bold mb-4">{route.name}</h1>

          {#if nextRide}
            <p class="text-xl text-warm-gray-300 mb-8">{formatDate(nextRide.date)}</p>
          {/if}

          <!-- Timeline -->
          <div class="flex items-center justify-center gap-4 md:gap-8 mb-8">
            <div class="text-center">
              <div class="text-xs text-warm-gray-400 uppercase tracking-wider mb-1">Meet</div>
              <div class="text-2xl md:text-3xl font-bold">{formatTime(route.departure_time)}</div>
            </div>
            <div class="text-warm-gray-600 text-2xl">&rarr;</div>
            <div class="text-center">
              <div class="text-xs text-warm-gray-400 uppercase tracking-wider mb-1">Roll</div>
              <div class="text-2xl md:text-3xl font-bold">
                {(() => {
                  const [h, m] = route.departure_time.split(':').map(Number);
                  const rollMin = m + 10;
                  return formatTime(`${String(h + Math.floor(rollMin / 60)).padStart(2, '0')}:${String(rollMin % 60).padStart(2, '0')}`);
                })()}
              </div>
            </div>
          </div>

          {#if isLive}
            <button on:click={startTracking} class="btn bg-green-500 hover:bg-green-600 text-white text-lg px-8 py-4 rounded-xl shadow-lg">
              Track Live Now
            </button>
          {:else if nextRide}
            <div class="inline-block px-6 py-3 bg-white/10 rounded-xl text-warm-gray-300">
              Ride scheduled &mdash; check back on the day to track live
            </div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <!-- Standard Route Header -->
    <div class="container mx-auto px-6 pt-8">
      <a href="/browse" class="text-primary hover:text-secondary font-medium mb-3 inline-block">&larr; Back to Browse</a>
      <div class="flex items-start justify-between gap-4 mb-3">
        <div class="flex items-center gap-3">
          {#if route.start_location_icon_url}
            <img src="{route.start_location_icon_url}" alt="Route icon" class="w-12 h-12 object-contain rounded-lg" />
          {/if}
          <h1 class="text-4xl font-bold text-warm-gray-900">{route.name}</h1>
        </div>
        {#if isLive}
          <div class="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-full">
            <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            Live Now
          </div>
        {:else if nextRide}
          <span class="px-4 py-2 bg-warm-gray-200 text-warm-gray-700 text-sm font-semibold rounded-full">Scheduled</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Route Content -->
  <div class="container mx-auto px-6 py-6">
    <div class="max-w-5xl mx-auto">
      <div class="grid md:grid-cols-3 gap-6 mb-6">
        <div class="md:col-span-2">
          <div class="h-96 mb-4 rounded-2xl overflow-hidden">
            <Map waypoints={route.waypoints || []} showMarkers={false} />
          </div>

          {#if route.description}
            <div class="card">
              <h3 class="font-bold mb-2 text-warm-gray-900">About this ride</h3>
              <Markdown content={route.description} className="text-warm-gray-600" />
            </div>
          {/if}

          {#if otherRides.length > 0}
            <div class="card mt-4">
              <h3 class="font-bold mb-3 text-warm-gray-900">Other Upcoming Dates</h3>
              <div class="space-y-2">
                {#each otherRides as ride}
                  <div class="flex items-center justify-between p-3 rounded-lg border border-warm-gray-200 hover:bg-warm-gray-50">
                    <div>
                      <div class="font-medium text-warm-gray-900">{formatDate(ride.date)}</div>
                      {#if ride.status === 'live'}
                        <div class="text-xs text-green-600 font-semibold mt-1">Live Now</div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Sidebar -->
        <div class="space-y-4">
          <div class="card">
            <h3 class="font-bold mb-4 text-warm-gray-900">Ride Info</h3>
            <div class="space-y-3">
              {#if nextRide}
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Next Ride</div>
                  <div class="font-semibold text-warm-gray-900">{formatDate(nextRide.date)}</div>
                </div>
              {/if}
              <div>
                <div class="text-xs text-warm-gray-500 mb-1">Departure</div>
                <div class="font-semibold text-warm-gray-900">{formatTime(route.departure_time)}</div>
              </div>
              {#if route.distance_miles}
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Distance</div>
                  <div class="font-semibold text-warm-gray-900">{route.distance_miles} miles</div>
                </div>
              {/if}
            </div>
          </div>

          {#if isLive}
            <button on:click={startTracking} class="btn btn-primary w-full py-4 text-lg">
              Track Live
            </button>
          {/if}

          <a href="/browse" class="btn btn-secondary w-full block text-center">
            Browse All Rides
          </a>
        </div>
      </div>
    </div>
  </div>
{/if}
