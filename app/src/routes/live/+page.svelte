<script>
  import { onMount, onDestroy } from 'svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';
  import Map from '$lib/components/Map.svelte';
  import RoutePreview from '$lib/components/RoutePreview.svelte';

  let liveRides = [];
  let loading = true;
  let socket = null;
  let mapComponent;
  let pollInterval = null;
  let hoveredRide = null;
  let joinedRooms = new Set();

  // "Path clears" behavior:
  // Scheduled rides show their planned route (waypoints), no leader marker
  // Live rides suppress planned route, show only actual trail + leader marker
  $: ridesForMap = liveRides.map(ride => ({
    accessCode: ride.access_code,
    routeName: ride.route_name,
    waypoints: ride.status === 'live' ? [] : (ride.waypoints || []),
    leaderLocation: ride.status === 'live' ? (ride.current_location || null) : null,
    locationTrail: ride.status === 'live' ? (ride.location_trail || []) : []
  }));

  $: liveCount = liveRides.filter(r => r.status === 'live').length;
  $: scheduledCount = liveRides.filter(r => r.status === 'scheduled').length;

  onMount(() => {
    loadLiveRides();
    connectSocket();
    pollInterval = setInterval(loadLiveRides, 10000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  });

  async function loadLiveRides() {
    try {
      const res = await fetch(`${API_URL}/rides/live`);
      const data = await res.json();

      if (data.success) {
        // Preserve location_trail from previous state for live rides
        const prevTrails = {};
        liveRides.forEach(r => {
          if (r.location_trail && r.location_trail.length > 0) {
            prevTrails[r.access_code] = r.location_trail;
          }
        });

        liveRides = data.data.map(ride => ({
          ...ride,
          location_trail: prevTrails[ride.access_code] || []
        }));

        // If any new live rides appeared, re-sync socket rooms
        const currentLiveCodes = new Set(
          liveRides.filter(r => r.status === 'live').map(r => r.access_code)
        );
        const hasNewLive = [...currentLiveCodes].some(code => !joinedRooms.has(code));
        if (hasNewLive && socket && socket.connected) {
          socket.emit('watch:all');
        }
      }
    } catch (error) {
      console.error('Error loading live rides:', error);
    } finally {
      loading = false;
    }
  }

  function connectSocket() {
    socket = io(SOCKET_URL);

    socket.on('connect', () => {
      socket.emit('watch:all');
    });

    socket.on('watch:all:joined', (data) => {
      joinedRooms = new Set(data.rides);
    });

    socket.on('location:updated', (data) => {
      const { accessCode, lat, lng, timestamp } = data;

      liveRides = liveRides.map(ride => {
        if (ride.access_code === accessCode) {
          ride.current_location = { lat, lng, timestamp };
          if (!ride.location_trail) ride.location_trail = [];
          ride.location_trail = [...ride.location_trail, { lat, lng, timestamp }];
        }
        return ride;
      });

      if (mapComponent) {
        mapComponent.updateRideLeader(accessCode, { lat, lng });
      }
    });

    socket.on('ride:ended', ({ accessCode }) => {
      liveRides = liveRides.filter(r => r.access_code !== accessCode);
      joinedRooms.delete(accessCode);
    });
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
    <div class="mb-6">
      <a href="/browse" class="text-primary hover:text-secondary font-medium mb-3 inline-block">&larr; Back to Browse</a>
      <div class="flex items-center gap-3 mb-2">
        {#if liveCount > 0}
          <div class="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
        {/if}
        <h1 class="text-4xl font-bold text-warm-gray-900">Live Rides</h1>
      </div>
      <p class="text-warm-gray-600 text-lg">
        {#if liveCount > 0 && scheduledCount > 0}
          {liveCount} live now, {scheduledCount} starting soon
        {:else if liveCount > 0}
          {liveCount} ride{liveCount !== 1 ? 's' : ''} active now
        {:else if scheduledCount > 0}
          {scheduledCount} ride{scheduledCount !== 1 ? 's' : ''} starting soon
        {:else}
          Track bike trains happening right now
        {/if}
      </p>
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
        <h2 class="text-3xl font-bold mb-3 text-warm-gray-900">No rides right now</h2>
        <p class="text-warm-gray-600 mb-8 text-lg">
          No rides are live or starting within the next hour
        </p>
        <a href="/browse" class="btn btn-primary inline-block">
          Browse Upcoming Rides
        </a>
      </div>

    {:else}
      <!-- Map -->
      <div class="mb-6">
        <div class="h-[500px] md:h-[600px] rounded-2xl overflow-hidden border border-warm-gray-200">
          <Map
            bind:this={mapComponent}
            rides={ridesForMap}
            highlightedRide={hoveredRide}
          />
        </div>
        <div class="flex items-center justify-between mt-3">
          <p class="text-sm text-warm-gray-500">
            {liveCount + scheduledCount} ride{liveCount + scheduledCount !== 1 ? 's' : ''} on map
          </p>
          <div class="flex items-center gap-4 text-xs text-warm-gray-500">
            <span class="flex items-center gap-1">
              <span class="w-4 h-0.5 bg-warm-gray-400" style="border-style: dashed;"></span>
              Planned route
            </span>
            <span class="flex items-center gap-1">
              <span class="w-4 h-0.5 bg-gradient-to-r from-green-500 via-blue-500 to-purple-500"></span>
              Path traveled
            </span>
          </div>
        </div>
      </div>

      <!-- Ride Cards Grid -->
      <div class="grid md:grid-cols-3 gap-4">
        {#each liveRides as ride (ride.id)}
          <a
            href="{ride.route_slug ? `/${ride.route_slug}` : `/ride/${ride.id}`}"
            class="card hover:shadow-md transition-all p-0 overflow-hidden block {hoveredRide === ride.access_code ? 'ring-2 ring-primary shadow-lg' : ''}"
            on:mouseenter={() => hoveredRide = ride.access_code}
            on:mouseleave={() => hoveredRide = null}
          >
            {#if ride.waypoints && ride.waypoints.length > 0}
              <div class="h-24 w-full overflow-hidden relative">
                <RoutePreview waypoints={ride.waypoints} previewImageUrl={ride.preview_image_url} />
                <div class="absolute top-2 right-2">
                  {#if ride.status === 'live'}
                    <div class="flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full">
                      <div class="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      LIVE
                    </div>
                  {:else}
                    <div class="flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-white text-xs font-semibold rounded-full">
                      {formatTime(ride.departure_time)}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
            <div class="p-3">
              <h3 class="font-bold text-warm-gray-900 text-sm mb-1">{ride.route_name}</h3>
              <div class="flex items-center gap-2 text-xs text-warm-gray-600">
                {#if ride.status === 'live'}
                  <span class="text-green-600 font-medium">Broadcasting</span>
                {:else}
                  <span>Departs {formatTime(ride.departure_time)}</span>
                {/if}
                {#if ride.distance_miles}
                  <span>&bull;</span>
                  <span>{ride.distance_miles} mi</span>
                {/if}
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}

  </div>
</div>
