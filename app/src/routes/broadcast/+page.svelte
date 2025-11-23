<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL } from '$lib/config.js';

  let accessCode = '';
  let route = null;
  let loading = true;
  let broadcasting = false;
  let followerCount = 0;
  let currentLocation = null;
  let socket = null;
  let watchId = null;

  onMount(() => {
    // Check for access code in URL or localStorage
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');

    if (urlCode) {
      accessCode = urlCode;
      loadRoute();
    } else {
      const savedCode = localStorage.getItem('my_route_code');
      if (savedCode) {
        accessCode = savedCode;
        loadRoute();
      } else {
        loading = false;
      }
    }
  });

  async function loadRoute() {
    loading = true;

    try {
      const res = await fetch(`${API_URL}/routes/${accessCode}`);
      const data = await res.json();

      if (!data.success) {
        alert('Route not found. Check your access code.');
        accessCode = '';
        route = null;
        return;
      }

      route = data.data;

    } catch (err) {
      alert('Failed to load route');
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function startBroadcasting() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    // Connect to WebSocket
    socket = io(API_URL);

    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('ride:start', { accessCode });
    });

    socket.on('ride:started', () => {
      broadcasting = true;

      // Start watching position
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;

          // Update current location for map centering
          currentLocation = { lat: latitude, lng: longitude };

          socket.emit('location:update', {
            accessCode,
            lat: latitude,
            lng: longitude,
            accuracy
          });
        },
        (error) => {
          console.error('Geolocation error:', error);
          alert('Error getting location. Make sure location services are enabled.');
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );
    });

    socket.on('follower:joined', (data) => {
      followerCount = data.followerCount;
    });

    socket.on('follower:left', (data) => {
      followerCount = data.followerCount;
    });
  }

  function stopBroadcasting() {
    if (!confirm('End this ride? All followers will be disconnected.')) {
      return;
    }

    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    if (socket) {
      socket.emit('ride:end', { accessCode });
      socket.disconnect();
    }

    broadcasting = false;
    alert('Ride ended successfully!');
    window.location.href = '/manage?code=' + accessCode;
  }

  onDestroy(() => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (socket) {
      socket.disconnect();
    }
  });
</script>

<svelte:head>
  <title>Broadcast Ride - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-8">

    {#if loading}
      <div class="text-center py-16">
        <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-warm-gray-600 text-lg">Loading route...</p>
      </div>

    {:else if !route}
      <!-- Access Code Entry -->
      <div class="max-w-md mx-auto">
        <div class="card">
          <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
            Start Broadcasting
          </h1>
          <p class="text-warm-gray-600 mb-6">
            Enter your route access code to start a live ride
          </p>

          <div class="mb-6">
            <label class="block text-sm font-medium text-warm-gray-900 mb-2">
              Access Code
            </label>
            <input
              type="text"
              bind:value={accessCode}
              on:keypress={(e) => e.key === 'Enter' && loadRoute()}
              class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., ABC123XYZ"
            />
          </div>

          <button
            on:click={loadRoute}
            disabled={!accessCode}
            class="w-full btn btn-primary py-3"
          >
            Load Route
          </button>

          <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            <strong>Don't have a route yet?</strong>
            <a href="/create" class="text-primary hover:underline ml-1">Create one here</a>
          </div>
        </div>
      </div>

    {:else if !broadcasting}
      <!-- Pre-Broadcast Screen -->
      <div class="max-w-4xl mx-auto">
        <div class="card mb-6">
          <h1 class="text-3xl font-bold text-warm-gray-900 mb-2">{route.name}</h1>
          {#if route.description}
            <p class="text-warm-gray-600 mb-4">{route.description}</p>
          {/if}

          <div class="flex gap-6 text-sm text-warm-gray-600 mb-6">
            <div>
              <span class="font-medium">Departs:</span> {route.departure_time}
            </div>
            {#if route.estimated_duration}
              <div>
                <span class="font-medium">Duration:</span> ~{route.estimated_duration} min
              </div>
            {/if}
          </div>

          <div class="h-64 rounded-lg overflow-hidden mb-6">
            <Map waypoints={route.waypoints || []} />
          </div>

          <div class="p-4 bg-yellow-50 border border-yellow-200 rounded mb-6">
            <h3 class="font-semibold text-yellow-900 mb-2">Before you start:</h3>
            <ul class="text-sm text-yellow-800 space-y-1">
              <li>• Make sure your location services are enabled</li>
              <li>• Keep this page open during your entire ride</li>
              <li>• Your location will be shared with all followers</li>
              <li>• Click "End Ride" when you reach your destination</li>
            </ul>
          </div>

          <button
            on:click={startBroadcasting}
            class="btn btn-primary w-full py-4 text-lg"
          >
            Start Broadcasting
          </button>

          <a
            href="/manage?code={accessCode}"
            class="btn btn-secondary w-full mt-3"
          >
            Back to Manage
          </a>
        </div>
      </div>

    {:else}
      <!-- Broadcasting Screen -->
      <div class="max-w-6xl mx-auto">
        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <h1 class="text-4xl font-bold text-warm-gray-900">Broadcasting Live</h1>
            </div>
            <button on:click={stopBroadcasting} class="btn btn-danger">
              End Ride
            </button>
          </div>
          <p class="text-warm-gray-600 text-lg font-semibold">{route.name}</p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
            <div class="text-xs text-warm-gray-500 mb-2">Followers</div>
            <div class="text-4xl font-bold text-warm-gray-900">{followerCount}</div>
          </div>

          <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
            <div class="text-xs text-warm-gray-500 mb-2">GPS Status</div>
            <div class="text-xl font-bold mt-1 {currentLocation ? 'text-green-600' : 'text-warm-gray-400'}">
              {currentLocation ? 'Active' : 'Waiting...'}
            </div>
          </div>

          <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
            <div class="text-xs text-warm-gray-500 mb-2">Departure</div>
            <div class="text-xl font-bold text-warm-gray-900 mt-1">{route.departure_time}</div>
          </div>

          <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
            <div class="text-xs text-warm-gray-500 mb-2">Duration</div>
            <div class="text-xl font-bold text-warm-gray-900 mt-1">
              {route.estimated_duration ? `~${route.estimated_duration}m` : 'N/A'}
            </div>
          </div>
        </div>

        <!-- Map -->
        <div class="card p-0 overflow-hidden">
          <div class="h-[600px]">
            <Map
              waypoints={route.waypoints || []}
              leaderLocation={currentLocation}
            />
          </div>
        </div>

        <div class="mt-6 p-4 bg-green-50 border border-green-200 rounded text-center">
          <p class="text-sm text-green-800">
            <strong>Keep this page open!</strong> Your location is being broadcast to {followerCount} follower{followerCount !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>
    {/if}

  </div>
</div>
