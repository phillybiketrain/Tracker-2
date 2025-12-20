<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import Map from '$lib/components/Map.svelte';
  import Markdown from '$lib/components/Markdown.svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';

  let accessCode = '';
  let route = null;
  let loading = true;
  let broadcasting = false;
  let followerCount = 0;
  let currentLocation = null;
  let locationTrail = []; // Track leader's path over time
  let socket = null;
  let watchId = null;
  let wakeLock = null; // Keep screen on during broadcast

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

  async function startBroadcasting() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    // Request screen wake lock to keep screen on
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen wake lock activated');

        // Re-request wake lock if visibility changes (screen comes back)
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible' && broadcasting && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
          }
        });
      }
    } catch (err) {
      console.warn('Wake lock not supported or failed:', err);
    }

    // Connect to WebSocket
    socket = io(SOCKET_URL);

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

          // Add to location trail
          locationTrail = [...locationTrail, {
            lat: latitude,
            lng: longitude,
            timestamp: Date.now()
          }];

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

  async function stopBroadcasting() {
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

    // Release wake lock
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      console.log('Screen wake lock released');
    }

    broadcasting = false;
    alert('Ride ended successfully!');
    window.location.href = '/manage?code=' + accessCode;
  }

  onDestroy(async () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (socket) {
      socket.disconnect();
    }
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
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
            <Markdown content={route.description} className="text-warm-gray-600 mb-4" />
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
            <Map waypoints={route.waypoints || []} showMarkers={false} />
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

          <div class="flex gap-3">
            <button
              on:click={startBroadcasting}
              class="btn btn-primary py-4 text-lg flex-[3]"
            >
              Start Broadcasting
            </button>

            <a
              href="/manage?code={accessCode}"
              class="btn btn-secondary py-4 flex-1 flex items-center justify-center"
            >
              Back
            </a>
          </div>
        </div>
      </div>

    {:else}
      <!-- Broadcasting Screen - Mobile Optimized -->
      <div class="fixed inset-0 flex flex-col bg-warm-gray-50">
        <!-- Compact Header -->
        <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-warm-gray-200">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <h1 class="text-[1.125rem] font-bold text-warm-gray-900">Broadcasting Live</h1>
          </div>
          <button on:click={stopBroadcasting} class="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700">
            End Ride
          </button>
        </div>

        <!-- Compact Info Bar -->
        <div class="px-4 py-2 bg-white border-b border-warm-gray-200">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium text-warm-gray-900">{route.name}</span>
            <div class="flex items-center gap-4 text-warm-gray-600">
              <span>{followerCount} follower{followerCount !== 1 ? 's' : ''}</span>
              {#if route.estimated_duration}
                <span>~{route.estimated_duration}</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Full Screen Map -->
        <div class="flex-1 relative">
          <Map
            waypoints={route.waypoints || []}
            leaderLocation={currentLocation}
            locationTrail={locationTrail}
            autoCenter={true}
            showMarkers={false}
          />
        </div>
      </div>
    {/if}

  </div>
</div>
