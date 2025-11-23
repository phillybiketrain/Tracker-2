<script>
  import { onMount, onDestroy } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL } from '$lib/config.js';

  let accessCode = '';
  let inputCode = '';
  let status = 'entry'; // entry | loading | broadcasting | error
  let route = null;
  let followerCount = 0;
  let socket = null;
  let watchId = null;
  let mapComponent;
  let errorMessage = '';

  function handleSubmit() {
    if (!inputCode || inputCode.length !== 4) {
      errorMessage = 'Enter a 4-letter access code';
      return;
    }

    accessCode = inputCode.toUpperCase();
    startBroadcasting();
  }

  async function startBroadcasting() {
    status = 'loading';
    errorMessage = '';

    try {
      // Get today's ride for this access code
      const res = await fetch(
        `${API_URL}/rides/by-code/${accessCode}`
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Ride not found');
      }

      route = data.data;

      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
      }

      // Connect to WebSocket
      socket = io(API_URL);

      socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('ride:start', { accessCode });
      });

      socket.on('ride:started', () => {
        status = 'broadcasting';

        // Start watching position
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            socket.emit('location:update', {
              accessCode,
              lat: latitude,
              lng: longitude,
              accuracy
            });
          },
          (error) => {
            console.error('Geolocation error:', error);
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

      socket.on('error', (error) => {
        console.error('Socket error:', error);
        errorMessage = error.message || 'Connection error';
        status = 'error';
      });

    } catch (error) {
      console.error('Error starting broadcasting:', error);
      errorMessage = error.message;
      status = 'error';
    }
  }

  function stopBroadcasting() {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    if (socket) {
      socket.emit('ride:end', { accessCode });
      socket.disconnect();
    }

    status = 'entry';
    route = null;
    accessCode = '';
    inputCode = '';
    alert('Ride ended!');
  }

  onDestroy(() => {
    if (socket) socket.disconnect();
    if (watchId) navigator.geolocation.clearWatch(watchId);
  });
</script>

<svelte:head>
  <title>Start Broadcasting - Philly Bike Train</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">

  {#if status === 'entry'}
    <!-- Entry Screen: Enter Access Code -->
    <div class="max-w-md mx-auto">
      <div class="card">
        <h1 class="text-3xl font-bold mb-4 text-center">Start Broadcasting</h1>
        <p class="text-gray-600 mb-6 text-center">
          Enter your 4-letter access code to begin broadcasting your ride
        </p>

        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <div>
            <label class="block font-medium mb-2">Access Code</label>
            <input
              bind:value={inputCode}
              type="text"
              placeholder="e.g., ABCD"
              maxlength="4"
              class="input w-full text-center text-2xl font-mono uppercase"
              style="letter-spacing: 0.3em;"
            />
          </div>

          {#if errorMessage}
            <div class="p-3 bg-red-50 text-red-700 rounded">
              {errorMessage}
            </div>
          {/if}

          <button type="submit" class="btn btn-primary w-full">
            Start Broadcasting
          </button>
        </form>

        <div class="mt-6 pt-6 border-t">
          <p class="text-sm text-gray-600 text-center mb-3">
            Need to create a route?
          </p>
          <a href="/lead" class="btn btn-secondary w-full">
            Create New Route
          </a>
        </div>
      </div>
    </div>

  {:else if status === 'loading'}
    <!-- Loading -->
    <div class="max-w-md mx-auto card text-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <h2 class="text-2xl font-bold text-warm-gray-900">Connecting...</h2>
      <p class="text-warm-gray-600">Starting ride {accessCode}</p>
    </div>

  {:else if status === 'error'}
    <!-- Error -->
    <div class="max-w-md mx-auto card">
      <h2 class="text-2xl font-bold mb-2 text-center text-warm-gray-900">Connection Error</h2>
      <p class="text-warm-gray-600 mb-6 text-center">{errorMessage}</p>

      <button on:click={() => status = 'entry'} class="btn btn-primary w-full">
        Try Again
      </button>
    </div>

  {:else if status === 'broadcasting'}
    <!-- Broadcasting Screen - Optimized for mobile glanceability -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <h1 class="text-4xl font-bold text-warm-gray-900">Broadcasting</h1>
        </div>
        <button on:click={stopBroadcasting} class="btn btn-danger">
          End Ride
        </button>
      </div>
      <p class="text-warm-gray-600 text-lg">
        <span class="font-semibold">{route?.route_name || 'Ride'}</span> ·
        Code: <span class="font-mono font-bold">{accessCode}</span>
      </p>
    </div>

    <!-- Stats Cards - Large, glanceable for riding -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Followers</div>
        <div class="text-5xl font-bold text-warm-gray-900">{followerCount}</div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">GPS</div>
        <div class="text-xl font-bold text-green-600 mt-2">Active</div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Time</div>
        <div class="text-2xl font-bold text-warm-gray-900 mt-1">{route?.departure_time || '--:--'}</div>
      </div>
    </div>

    <!-- Map -->
    <div class="h-[500px] mb-6 rounded-2xl overflow-hidden">
      <Map
        waypoints={route?.waypoints || []}
        autoCenter={true}
      />
    </div>

    <!-- Route Info -->
    {#if route?.route_description}
      <div class="card">
        <h3 class="font-bold mb-2 text-warm-gray-900">About this route</h3>
        <p class="text-warm-gray-600">{route.route_description}</p>
      </div>
    {/if}
  {/if}

</div>
