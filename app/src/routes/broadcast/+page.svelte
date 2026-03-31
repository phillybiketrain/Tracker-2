<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';

  let accessCode = '';
  let route = null;
  let loading = true;
  let broadcasting = false;
  let connecting = false;
  let connectionError = null;
  let followerCount = 0;
  let currentLocation = null;
  let locationTrail = [];
  let socket = null;
  let watchId = null;
  let wakeLock = null;
  let startTimeout = null;
  let lastEmitTime = 0;
  let visibilityHandler = null;

  const GPS_EMIT_INTERVAL = 5000; // Throttle GPS emissions to once per 5s
  const TRAIL_MAX_LENGTH = 500;   // Cap in-memory trail

  // 4-box code entry state
  let codeChars = ['', '', '', ''];
  let codeInputRefs = [null, null, null, null];

  function handleCodeInput(i, e) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    codeChars[i] = val ? val[val.length - 1] : '';
    codeChars = [...codeChars];

    if (val && i < 3) {
      codeInputRefs[i + 1]?.focus();
    }

    if (codeChars.every(c => c)) {
      accessCode = codeChars.join('');
      loadRoute();
    }
  }

  function handleCodeKeydown(i, e) {
    if (e.key === 'Backspace' && !codeChars[i] && i > 0) {
      codeChars[i - 1] = '';
      codeChars = [...codeChars];
      codeInputRefs[i - 1]?.focus();
    }
  }

  function handleCodePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);

    for (let i = 0; i < 4; i++) {
      codeChars[i] = text[i] || '';
    }
    codeChars = [...codeChars];

    if (text.length >= 4) {
      accessCode = text.slice(0, 4);
      loadRoute();
    } else {
      codeInputRefs[Math.min(text.length, 3)]?.focus();
    }
  }

  function resetCode() {
    codeChars = ['', '', '', ''];
    codeChars = [...codeChars];
    accessCode = '';
    route = null;
    loading = false;
    connectionError = null;
    setTimeout(() => codeInputRefs[0]?.focus(), 50);
  }

  async function loadRoute() {
    loading = true;
    connectionError = null;

    try {
      const res = await fetch(`${API_URL}/routes/${accessCode}`);
      const data = await res.json();

      if (!data.success) {
        connectionError = 'Route not found. Check your code.';
        codeChars = ['', '', '', ''];
        codeChars = [...codeChars];
        route = null;
        loading = false;
        setTimeout(() => codeInputRefs[0]?.focus(), 50);
        return;
      }

      route = data.data;
      // Persist code so next visit auto-loads
      localStorage.setItem('my_route_code', accessCode);

    } catch (err) {
      connectionError = 'Failed to load route. Check your connection.';
      route = null;
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function onGpsPosition(position) {
    const { latitude, longitude, accuracy } = position.coords;
    currentLocation = { lat: latitude, lng: longitude };

    // Cap in-memory trail length
    if (locationTrail.length >= TRAIL_MAX_LENGTH) {
      locationTrail = locationTrail.slice(-Math.floor(TRAIL_MAX_LENGTH * 0.75));
    }
    locationTrail = [...locationTrail, { lat: latitude, lng: longitude, timestamp: Date.now() }];

    // Throttle socket emissions to save battery and reduce DB writes
    const now = Date.now();
    if (socket && socket.connected && (now - lastEmitTime) >= GPS_EMIT_INTERVAL) {
      lastEmitTime = now;
      socket.emit('location:update', { accessCode, lat: latitude, lng: longitude, accuracy });
    }
  }

  function onGpsError(error) {
    console.error('Geolocation error:', error);
    connectionError = 'Location error. Make sure location services are enabled.';
  }

  function startGpsWatch() {
    // Clear any existing watch before starting a new one
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = navigator.geolocation.watchPosition(
      onGpsPosition,
      onGpsError,
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible' || !broadcasting) return;

    // Re-acquire wake lock (released when page goes hidden)
    if ('wakeLock' in navigator && !wakeLock) {
      navigator.wakeLock.request('screen')
        .then(wl => { wakeLock = wl; wl.addEventListener('release', () => { wakeLock = null; }); })
        .catch(() => {});
    }

    // Re-establish GPS watch (may have been killed by OS while backgrounded)
    startGpsWatch();
  }

  async function startBroadcasting() {
    if (!navigator.geolocation) {
      connectionError = 'Location services are not available on this device.';
      return;
    }

    connecting = true;
    connectionError = null;

    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (err) {
      console.warn('Wake lock not supported or failed:', err);
    }

    // Register visibility handler (wake lock + GPS re-acquisition)
    visibilityHandler = handleVisibilityChange;
    document.addEventListener('visibilitychange', visibilityHandler);

    startTimeout = setTimeout(() => {
      if (connecting && !broadcasting) {
        connecting = false;
        connectionError = 'Connection timed out. Check your internet and try again.';
        if (socket) {
          socket.disconnect();
          socket = null;
        }
      }
    }, 15000);

    socket = io(SOCKET_URL, {
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000
      // reconnectionAttempts defaults to Infinity — leader should always retry
    });

    socket.on('connect', () => {
      // Fires on both initial connect AND every reconnect
      connectionError = null;
      socket.emit('ride:start', { accessCode });
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      // Don't act on connect_error — let the 15s startTimeout be the sole
      // decider for initial connect failure. During broadcast, Socket.IO
      // auto-reconnects and the disconnect handler shows the yellow banner.
    });

    socket.on('ride:error', (data) => {
      clearTimeout(startTimeout);
      connecting = false;
      connectionError = data.message || 'Failed to start ride. Please try again.';
      socket.disconnect();
      socket = null;
    });

    socket.on('ride:started', () => {
      clearTimeout(startTimeout);
      connecting = false;
      broadcasting = true;
      startGpsWatch();
    });

    socket.on('disconnect', () => {
      if (broadcasting) {
        connectionError = 'Connection lost. Reconnecting...';
      }
    });

    socket.on('follower:joined', (data) => { followerCount = data.followerCount; });
    socket.on('follower:left', (data) => { followerCount = data.followerCount; });
  }

  async function stopBroadcasting() {
    if (!confirm('End this ride? All followers will be disconnected.')) return;
    await endBroadcast();
    goto('/manage?code=' + accessCode);
  }

  async function endBroadcast() {
    if (startTimeout) { clearTimeout(startTimeout); startTimeout = null; }
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (socket) {
      if (broadcasting) {
        socket.emit('ride:end', { accessCode });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      socket.disconnect();
      socket = null;
    }
    if (wakeLock) {
      try { await wakeLock.release(); wakeLock = null; } catch (e) {}
    }
    broadcasting = false;
    connecting = false;
  }

  function handleBeforeUnload() {
    if (broadcasting && socket) socket.emit('ride:end', { accessCode });
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');

    if (urlCode) {
      accessCode = urlCode.toUpperCase().slice(0, 4);
      codeChars = accessCode.split('').concat(['', '', '', '']).slice(0, 4);
      loadRoute();
    } else {
      const savedCode = localStorage.getItem('my_route_code');
      if (savedCode) {
        accessCode = savedCode;
        codeChars = savedCode.split('').concat(['', '', '', '']).slice(0, 4);
        loadRoute();
      } else {
        loading = false;
        setTimeout(() => codeInputRefs[0]?.focus(), 100);
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onDestroy(async () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    await endBroadcast();
  });
</script>

<svelte:head>
  <title>Lead a Ride - Philly Bike Train</title>
</svelte:head>

{#if loading}
  <!-- Loading -->
  <div class="min-h-screen flex items-center justify-center bg-warm-gray-50">
    <div class="text-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-warm-gray-600">Loading your route...</p>
    </div>
  </div>

{:else if !route}
  <!-- Code Entry -->
  <div class="min-h-screen flex items-center justify-center bg-warm-gray-50">
    <div class="w-full max-w-sm mx-auto px-6">
      <div class="text-center mb-10">
        <h1 class="text-3xl font-bold text-warm-gray-900 mb-2">Lead a Ride</h1>
        <p class="text-warm-gray-500">Enter your 4-character route code</p>
      </div>

      {#if connectionError}
        <div class="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
          {connectionError}
        </div>
      {/if}

      <div class="flex gap-3 justify-center mb-10" on:paste={handleCodePaste}>
        {#each [0, 1, 2, 3] as i}
          <input
            bind:this={codeInputRefs[i]}
            type="text"
            maxlength="2"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="characters"
            spellcheck="false"
            value={codeChars[i]}
            on:input={(e) => handleCodeInput(i, e)}
            on:keydown={(e) => handleCodeKeydown(i, e)}
            class="w-16 h-20 text-center text-3xl font-mono font-bold uppercase border-2 rounded-xl focus:outline-none transition-colors {codeChars[i] ? 'border-primary bg-primary/5 text-primary' : 'border-warm-gray-300 bg-white text-warm-gray-900'} focus:border-primary"
          />
        {/each}
      </div>

      <p class="text-center text-sm text-warm-gray-500">
        Don't have a route yet?
        <a href="/create" class="text-primary hover:underline">Create one here</a>
      </p>
    </div>
  </div>

{:else if !broadcasting}
  <!-- Pre-broadcast: route confirmed, one tap to go live -->
  <div class="min-h-screen flex items-center justify-center bg-warm-gray-50">
    <div class="w-full max-w-sm mx-auto px-6">
      <div class="text-center mb-10">
        <div class="w-3 h-3 bg-green-500 rounded-full mx-auto mb-5 animate-pulse"></div>
        <h1 class="text-4xl font-bold text-warm-gray-900 mb-3 leading-tight">{route.name}</h1>
        {#if route.departure_time}
          <p class="text-warm-gray-500 text-lg">Departs {route.departure_time}</p>
        {/if}
      </div>

      {#if connectionError}
        <div class="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
          {connectionError}
        </div>
      {/if}

      <button
        on:click={startBroadcasting}
        disabled={connecting}
        class="w-full py-6 text-2xl font-bold text-white bg-green-500 hover:bg-green-600 active:bg-green-700 rounded-2xl transition-colors disabled:opacity-70 flex items-center justify-center gap-3 shadow-lg"
      >
        {#if connecting}
          <div class="w-6 h-6 border-[3px] border-white border-t-transparent rounded-full animate-spin"></div>
          Connecting...
        {:else}
          Go Live
        {/if}
      </button>

      <p class="text-center mt-8 text-sm text-warm-gray-400">
        <button on:click={resetCode} class="hover:text-warm-gray-700 underline underline-offset-2">
          Wrong route? Change code
        </button>
      </p>
    </div>
  </div>

{:else}
  <!-- Broadcasting Screen — mobile optimized, full screen -->
  <div class="fixed inset-0 flex flex-col bg-warm-gray-50">
    <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-warm-gray-200">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <h1 class="text-[1.125rem] font-bold text-warm-gray-900">Broadcasting Live</h1>
      </div>
      <button on:click={stopBroadcasting} class="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 active:bg-red-800">
        End Ride
      </button>
    </div>

    {#if connectionError}
      <div class="px-4 py-2 bg-yellow-500 text-yellow-900 text-sm font-medium flex items-center gap-2">
        <div class="w-4 h-4 border-2 border-yellow-900 border-t-transparent rounded-full animate-spin"></div>
        {connectionError}
      </div>
    {/if}

    <div class="px-4 py-2 bg-white border-b border-warm-gray-200">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium text-warm-gray-900">{route.name}</span>
        <div class="flex items-center gap-4 text-warm-gray-600">
          <span>{followerCount} follower{followerCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>

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
