<script>
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL } from '$lib/config.js';

  let ride = null;
  let loading = true;
  let tracking = false;
  let leaderLocation = null;
  let followerCount = 0;
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
      } else {
        alert('Ride not found');
      }

    } catch (error) {
      console.error('Error loading ride:', error);
      alert('Failed to load ride');
    } finally {
      loading = false;
    }
  }

  // Parse date string (YYYY-MM-DD or ISO timestamp) in local timezone
  function parseLocalDate(dateStr) {
    // Extract just the date portion if it's an ISO timestamp
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function startTracking() {
    if (!ride) return;

    tracking = true;

    // Connect to WebSocket
    socket = io(API_URL);

    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('follow:start', { accessCode: ride.access_code });
    });

    socket.on('follow:started', (data) => {
      followerCount = data.followerCount;
    });

    socket.on('location:updated', (data) => {
      leaderLocation = {
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy
      };
      lastUpdate = new Date(data.timestamp);
    });

    socket.on('follower:joined', (data) => {
      followerCount = data.followerCount;
    });

    socket.on('follower:left', (data) => {
      followerCount = data.followerCount;
    });

    socket.on('ride:ended', () => {
      alert('The leader has ended this ride');
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
    if (mapComponent) {
      mapComponent.centerOnLeader();
    }
  }

  function getTimeSinceUpdate() {
    if (!lastUpdate) return 'Waiting for GPS...';

    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);

    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  async function expressInterest() {
    try {
      let sessionId = localStorage.getItem('session_id');
      if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('session_id', sessionId);
      }

      const res = await fetch(`${API_URL}/rides/${rideId}/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });

      if (res.ok) {
        alert('Interest recorded!');
        loadRide();
      }
    } catch (error) {
      console.error('Error expressing interest:', error);
    }
  }

  let timeInterval;
  onMount(() => {
    timeInterval = setInterval(() => {
      if (tracking) {
        lastUpdate = lastUpdate;
      }
    }, 1000);
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
        <a href="/" class="text-primary hover:text-secondary font-medium mb-3 inline-block">← Back to Browse</a>
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
              Live
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
              <p class="text-warm-gray-600">{ride.route_description}</p>
            </div>
          {/if}

          {#if ride.other_rides && ride.other_rides.length > 0}
            <div class="card">
              <h3 class="font-bold mb-3 text-warm-gray-900">Other Scheduled Rides</h3>
              <div class="space-y-2">
                {#each ride.other_rides as otherRide}
                  <a
                    href="/ride/{otherRide.id}"
                    class="block p-3 rounded-lg border border-warm-gray-200 hover:bg-warm-gray-50 transition-colors"
                  >
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-medium text-warm-gray-900">
                          {parseLocalDate(otherRide.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        {#if otherRide.status === 'live'}
                          <div class="text-xs text-green-600 font-semibold mt-1">Live Now</div>
                        {:else if otherRide.interest_count > 0}
                          <div class="text-xs text-warm-gray-500 mt-1">{otherRide.interest_count} interested</div>
                        {/if}
                      </div>
                      <svg class="w-5 h-5 text-warm-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div class="space-y-4">
          <div class="card">
            <h3 class="font-bold mb-4 text-warm-gray-900">Ride Info</h3>
            <div class="space-y-3">
              <div>
                <div class="text-xs text-warm-gray-500 mb-1">Date</div>
                <div class="font-semibold text-warm-gray-900">{parseLocalDate(ride.date).toLocaleDateString()}</div>
              </div>
              <div>
                <div class="text-xs text-warm-gray-500 mb-1">Departure</div>
                <div class="font-semibold text-warm-gray-900">{ride.departure_time}</div>
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
              {#if ride.interest_count > 0}
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Interested</div>
                  <div class="font-semibold text-warm-gray-900">{ride.interest_count} people</div>
                </div>
              {/if}
            </div>
          </div>

          {#if ride.status === 'live'}
            <button on:click={startTracking} class="btn btn-primary w-full">
              Track Live
            </button>
          {:else}
            <button on:click={expressInterest} class="btn btn-secondary w-full">
              I'm Interested
            </button>
          {/if}

          <a href="/" class="btn btn-secondary w-full block text-center">
            Back to Browse
          </a>
        </div>
      </div>
    </div>

  {:else}
    <!-- Live Tracking View - Optimized for mobile -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <h1 class="text-4xl font-bold text-warm-gray-900">Live Tracking</h1>
        </div>
        <button on:click={stopTracking} class="btn btn-danger">
          Stop
        </button>
      </div>
      <p class="text-warm-gray-600 text-lg font-semibold">{ride.route_name}</p>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Followers</div>
        <div class="text-4xl font-bold text-warm-gray-900">{followerCount}</div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">GPS</div>
        <div class="text-xl font-bold mt-1 {leaderLocation ? 'text-green-600' : 'text-warm-gray-400'}">
          {leaderLocation ? 'Active' : 'Waiting'}
        </div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Updated</div>
        <div class="text-lg font-bold text-warm-gray-900 mt-1">{getTimeSinceUpdate()}</div>
      </div>
    </div>

    <div class="relative">
      <div class="h-[600px] rounded-2xl overflow-hidden">
        <Map
          bind:this={mapComponent}
          waypoints={ride.waypoints || []}
          {leaderLocation}
          showMarkers={false}
        />
      </div>

      {#if leaderLocation}
        <button
          on:click={centerOnLeader}
          class="absolute bottom-6 right-6 btn btn-primary shadow-lg"
        >
          Center on Leader
        </button>
      {/if}
    </div>
  {/if}

</div>
