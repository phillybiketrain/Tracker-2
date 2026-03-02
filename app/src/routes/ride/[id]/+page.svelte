<script>
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import Markdown from '$lib/components/Markdown.svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';

  let ride = null;
  let loading = true;
  let tracking = false;
  let leaderLocation = null;
  let lastUpdate = null;
  let socket = null;
  let mapComponent;

  const rideId = $page.params.id;

  onMount(async () => {
    await loadRide();
  });

  async function loadRide() {
    loading = true;
    try {
      const res = await fetch(`${API_URL}/rides/${rideId}`);
      const data = await res.json();
      if (data.success) {
        ride = data.data;
      }
    } catch (error) {
      console.error('Error loading ride:', error);
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

  function startTracking() {
    if (!ride) return;

    tracking = true;

    socket = io(SOCKET_URL);

    socket.on('connect', () => {
      socket.emit('follow:start', { accessCode: ride.access_code });
    });

    socket.on('location:updated', (data) => {
      leaderLocation = { lat: data.lat, lng: data.lng, accuracy: data.accuracy };
      lastUpdate = new Date(data.timestamp);
    });

    socket.on('ride:ended', () => {
      stopTracking();
    });
  }

  function stopTracking() {
    if (socket) {
      socket.emit('follow:stop', { accessCode: ride.access_code });
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
  onMount(() => {
    timeInterval = setInterval(() => { lastUpdate = lastUpdate; }, 1000);
  });

  onDestroy(() => {
    if (socket) socket.disconnect();
    if (timeInterval) clearInterval(timeInterval);
  });
</script>

<svelte:head>
  <title>{ride?.route_name || 'Ride'} - Philly Bike Train</title>
</svelte:head>

<div class="container mx-auto px-6 py-8">

  {#if loading}
    <div class="text-center py-16">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-warm-gray-600 text-lg">Loading ride...</p>
    </div>

  {:else if !ride}
    <div class="card text-center max-w-md mx-auto py-12">
      <h2 class="text-3xl font-bold mb-4 text-warm-gray-900">Ride Not Found</h2>
      <a href="/" class="btn btn-primary">Browse Rides</a>
    </div>

  {:else if !tracking}
    <!-- Ride Details View -->
    <div class="max-w-5xl mx-auto">
      <div class="mb-6">
        <a href="/browse" class="text-primary hover:text-secondary font-medium mb-3 inline-block">← Back to Browse</a>
        <div class="flex items-start justify-between gap-4 mb-3">
          <div class="flex items-center gap-3">
            {#if ride.start_location_icon_url}
              <img src="{ride.start_location_icon_url}" alt="Route icon" class="w-12 h-12 object-contain rounded-lg" />
            {/if}
            <h1 class="text-4xl font-bold text-warm-gray-900">{ride.route_name}</h1>
          </div>
          {#if ride.status === 'live'}
            <div class="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-full">
              <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Live Now
            </div>
          {:else}
            <span class="px-4 py-2 bg-warm-gray-200 text-warm-gray-700 text-sm font-semibold rounded-full">
              Scheduled
            </span>
          {/if}
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-6 mb-6">
        <div class="md:col-span-2">
          <div class="h-96 mb-4 rounded-2xl overflow-hidden">
            <Map waypoints={ride.waypoints || []} showMarkers={false} />
          </div>

          {#if ride.route_description}
            <div class="card">
              <h3 class="font-bold mb-2 text-warm-gray-900">About this ride</h3>
              <Markdown content={ride.route_description} className="text-warm-gray-600" />
            </div>
          {/if}

          {#if ride.other_rides && ride.other_rides.length > 0}
            <div class="card mt-4">
              <h3 class="font-bold mb-3 text-warm-gray-900">Other Upcoming Dates</h3>
              <div class="space-y-2">
                {#each ride.other_rides as otherRide}
                  <a
                    href="/ride/{otherRide.id}"
                    class="flex items-center justify-between p-3 rounded-lg border border-warm-gray-200 hover:bg-warm-gray-50 transition-colors"
                  >
                    <div>
                      <div class="font-medium text-warm-gray-900">
                        {parseLocalDate(otherRide.date).toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric'
                        })}
                      </div>
                      {#if otherRide.status === 'live'}
                        <div class="text-xs text-green-600 font-semibold mt-1">Live Now</div>
                      {/if}
                    </div>
                    <svg class="w-5 h-5 text-warm-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
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
              <div>
                <div class="text-xs text-warm-gray-500 mb-1">Date</div>
                <div class="font-semibold text-warm-gray-900">
                  {parseLocalDate(ride.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <div>
                <div class="text-xs text-warm-gray-500 mb-1">Departure</div>
                <div class="font-semibold text-warm-gray-900">{formatTime(ride.departure_time)}</div>
              </div>
              {#if ride.distance_miles}
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Distance</div>
                  <div class="font-semibold text-warm-gray-900">{ride.distance_miles} miles</div>
                </div>
              {/if}
              {#if ride.estimated_duration}
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Duration</div>
                  <div class="font-semibold text-warm-gray-900">{ride.estimated_duration}</div>
                </div>
              {/if}
            </div>
          </div>

          {#if ride.status === 'live'}
            <button on:click={startTracking} class="btn btn-primary w-full py-4 text-lg">
              Track Live
            </button>
          {/if}

          <a href="/browse" class="btn btn-secondary w-full block text-center">
            Back to Browse
          </a>
        </div>
      </div>
    </div>

  {:else}
    <!-- Live Tracking View — mobile optimized, full screen -->
    <div class="fixed inset-0 flex flex-col bg-warm-gray-50">
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-warm-gray-200">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <h1 class="text-[1.125rem] font-bold text-warm-gray-900">Tracking Live</h1>
        </div>
        <div class="flex items-center gap-2">
          {#if leaderLocation}
            <button
              on:click={centerOnLeader}
              class="px-2 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-blue-700 transition-colors"
            >
              Center
            </button>
          {/if}
          <button on:click={stopTracking} class="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700">
            Stop
          </button>
        </div>
      </div>

      <!-- Status Bar -->
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
        <span class="font-medium text-warm-gray-700 text-xs">{ride.route_name}</span>
      </div>

      <div class="flex-1 relative">
        <Map
          bind:this={mapComponent}
          waypoints={ride.waypoints || []}
          {leaderLocation}
          showMarkers={false}
        />
      </div>
    </div>
  {/if}

</div>
