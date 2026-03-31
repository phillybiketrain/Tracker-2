<script>
  import { onMount, onDestroy } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';

  let route = null;
  let nextRide = null;
  let loading = true;
  let tracking = false;
  let leaderLocation = null;
  let lastUpdate = null;
  let socket = null;
  let mapComponent;
  let timeInterval;

  onMount(async () => {
    try {
      const res = await fetch(`${API_URL}/routes/by-slug/navyyard`);
      const data = await res.json();
      if (data.success) {
        route = data.data;
        nextRide = data.data.next_ride;
      }
    } catch (e) {
      console.error('Failed to load route:', e);
    } finally {
      loading = false;
    }
    timeInterval = setInterval(() => { lastUpdate = lastUpdate; }, 1000);
  });

  onDestroy(() => {
    if (socket) socket.disconnect();
    if (timeInterval) clearInterval(timeInterval);
  });

  function startTracking() {
    if (!route) return;
    tracking = true;
    socket = io(SOCKET_URL);
    socket.on('connect', () => {
      socket.emit('follow:start', { accessCode: route.access_code });
    });
    socket.on('location:updated', (data) => {
      leaderLocation = { lat: data.lat, lng: data.lng };
      lastUpdate = new Date(data.timestamp);
    });
    socket.on('ride:ended', () => stopTracking());
  }

  function stopTracking() {
    if (socket) { socket.disconnect(); socket = null; }
    tracking = false;
    leaderLocation = null;
  }

  function centerOnLeader() {
    if (mapComponent) mapComponent.centerOnLeader();
  }

  $: isLive = nextRide && nextRide.status === 'live';
</script>

<svelte:head>
  <title>Navy Yard Ride - Philly Bike Train</title>
</svelte:head>

{#if tracking}
  <!-- Full-screen live tracking -->
  <div class="fixed inset-0 flex flex-col bg-warm-gray-50">
    <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-warm-gray-200">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <h1 class="text-lg font-bold text-warm-gray-900">Tracking Live</h1>
      </div>
      <div class="flex items-center gap-2">
        {#if leaderLocation}
          <button on:click={centerOnLeader} class="px-2 py-1 text-xs font-medium text-white bg-primary rounded">Center</button>
        {/if}
        <button on:click={stopTracking} class="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded">Stop</button>
      </div>
    </div>
    <div class="flex-1 relative">
      <Map bind:this={mapComponent} waypoints={route?.waypoints || []} {leaderLocation} showMarkers={false} autoCenter={true} />
    </div>
  </div>

{:else}
  <div class="min-h-screen bg-white flex flex-col">

    <!-- Hero -->
    <div class="flex-1 flex flex-col items-center px-6 pt-10 pb-6 max-w-lg mx-auto w-full">

      <!-- Co-branding logos -->
      <div class="flex items-center justify-center gap-5 mb-8">
        <img src="/pbt_logo.png" alt="Philly Bike Train" class="h-20 md:h-24 w-auto" onerror="this.style.display='none'" />
        <span class="text-3xl text-warm-gray-400 font-light select-none">&times;</span>
        <img src="/navyyard_logo.png" alt="Navy Yard Philadelphia" class="h-20 md:h-24 w-auto" onerror="this.style.display='none'" />
      </div>

      <!-- Headline -->
      <div class="text-center mb-6">
        <div class="inline-block px-3 py-1 bg-warm-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-full mb-3 rotate-[-3deg]">
          Special Event
        </div>
        <h1 class="text-4xl md:text-5xl font-black text-warm-gray-900 leading-tight mb-1" style="font-family: system-ui, -apple-system, sans-serif;">
          Ride with us!
        </h1>
        <p class="text-2xl md:text-3xl font-bold text-warm-gray-900">
          Wednesday, May 6<sup>th</sup>
        </p>
      </div>

      <!-- Start / End -->
      <div class="w-full mb-8">
        <div class="flex items-start gap-4 mb-2">
          {#if route?.start_location_icon_url}
            <img src={route.start_location_icon_url} alt="" class="w-10 h-10 mt-0.5 object-contain rounded" />
          {/if}
          <div>
            <div class="flex items-baseline gap-3 mb-1">
              <span class="font-bold text-warm-gray-900 w-12">Start:</span>
              <span class="text-lg text-warm-gray-800">Ultimo Coffee 15th &amp; Mifflin</span>
            </div>
            <div class="flex items-baseline gap-3">
              <span class="font-bold text-warm-gray-900 w-12">End:</span>
              <span class="text-lg text-warm-gray-800">Marine Parade Grounds</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Meet / Roll / Arrive timeline -->
      <div class="flex items-center justify-center w-full mb-8">
        <div class="flex items-center">
          <div class="text-center px-4">
            <div class="text-sm font-medium text-warm-gray-500 mb-1">Meet</div>
            <div class="text-2xl md:text-3xl font-black text-warm-gray-900">7:20am</div>
          </div>
          <div class="flex items-center text-warm-gray-300">
            <div class="w-8 md:w-12 h-px bg-warm-gray-300"></div>
            <svg class="w-4 h-4 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div class="text-center px-4">
            <div class="text-sm font-medium text-warm-gray-500 mb-1">Roll</div>
            <div class="text-2xl md:text-3xl font-black text-warm-gray-900">7:30am</div>
          </div>
          <div class="flex items-center text-warm-gray-300">
            <div class="w-8 md:w-12 h-px bg-warm-gray-300"></div>
            <svg class="w-4 h-4 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div class="text-center px-4">
            <div class="text-sm font-medium text-warm-gray-500 mb-1">Arrive</div>
            <div class="text-2xl md:text-3xl font-black text-warm-gray-900">8:00am</div>
          </div>
        </div>
      </div>

      <!-- Coffee callout -->
      <div class="bg-warm-gray-100 rounded-2xl p-5 w-full mb-8 text-center">
        <p class="text-warm-gray-600 text-sm mb-1">Can't make the ride?</p>
        <p class="text-xl font-bold text-warm-gray-900 mb-1">Join us for coffee!</p>
        <p class="text-lg font-semibold text-warm-gray-800">8:00-9:00am</p>
        <p class="text-warm-gray-700">Marine Parade Grounds</p>
      </div>

      <!-- CTA -->
      {#if loading}
        <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
      {:else if isLive}
        <button on:click={startTracking} class="w-full py-4 bg-green-500 hover:bg-green-600 text-white text-xl font-bold rounded-xl shadow-lg transition-colors">
          Track Live Now
        </button>
      {:else}
        <!-- Route map preview -->
        {#if route?.waypoints}
          <div class="w-full h-48 rounded-xl overflow-hidden mb-4">
            <Map waypoints={route.waypoints} showMarkers={false} />
          </div>
        {/if}
        <div class="w-full py-3 bg-warm-gray-100 text-warm-gray-500 text-center text-sm rounded-xl">
          Live tracking available on ride day
        </div>
      {/if}
    </div>

    <!-- Bottom bike train illustration (CSS) -->
    <div class="mt-auto border-t border-warm-gray-100 py-4 text-center overflow-hidden">
      <div class="text-4xl tracking-[0.3em] opacity-30 select-none">
        🚲🚲🚲🚲🚲🚲🚲🚲
      </div>
      <div class="mt-3 text-xs font-bold tracking-[0.2em] text-warm-gray-400 uppercase">
        phillybiketrain.org
      </div>
    </div>

  </div>
{/if}
