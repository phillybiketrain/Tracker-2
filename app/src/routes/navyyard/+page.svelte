<script>
  import { onMount, onDestroy } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import Markdown from '$lib/components/Markdown.svelte';
  import { io } from 'socket.io-client';
  import { API_URL, SOCKET_URL } from '$lib/config.js';

  let route = null;
  let nextRide = null;
  let otherRides = [];
  let loading = true;
  let tracking = false;
  let leaderLocation = null;
  let lastUpdate = null;
  let socket = null;
  let mapComponent;
  let timeInterval;

  const SPECIAL_DATE = '2026-05-06';

  onMount(async () => {
    try {
      const res = await fetch(`${API_URL}/routes/by-slug/navyyard`);
      const data = await res.json();
      if (data.success) {
        route = data.data;
        nextRide = data.data.next_ride;
        otherRides = data.data.other_rides || [];
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

  function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(dateStr) {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
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

  $: isLive = nextRide && nextRide.status === 'live';
  $: showSpecialHero = new Date(SPECIAL_DATE) > new Date();
</script>

<svelte:head>
  <title>Navy Yard Ride - Philly Bike Train</title>
</svelte:head>

{#if tracking}
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

  <!-- ============================================ -->
  <!-- SPECIAL EVENT HERO — full viewport takeover  -->
  <!-- ============================================ -->
  {#if showSpecialHero}
    <div class="relative text-white overflow-hidden" style="min-height: 70vh; background: #0a0a0a;">
      <!-- Subtle radial glow -->
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(232,93,4,0.08)_0%,transparent_70%)]"></div>

      <div class="relative z-10 flex flex-col items-center justify-center px-6 py-12 md:py-16" style="min-height: 70vh;">

        <!-- Co-branding -->
        <div class="flex items-center justify-center gap-6 md:gap-10 mb-10">
          <img src="/pbt_logo.svg" alt="Philly Bike Train" class="h-16 md:h-24 lg:h-28 w-auto" />
          <span class="text-3xl md:text-4xl text-warm-gray-600 font-extralight select-none">&times;</span>
          <img src="/navyyard_logo.svg" alt="Navy Yard Philadelphia" class="h-12 md:h-20 lg:h-24 w-auto" />
        </div>

        <!-- Headline -->
        <div class="text-center mb-10">
          <h1 class="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.95] mb-4 tracking-tight">
            Ride with us!
          </h1>
          <p class="text-3xl md:text-4xl lg:text-5xl font-bold text-warm-gray-300">
            Wednesday, May 6<sup class="text-lg md:text-xl">th</sup>
          </p>
        </div>

        <!-- Start / End -->
        <div class="mb-10 text-center md:text-left">
          <div class="inline-flex flex-col gap-2 text-lg md:text-xl">
            <div class="flex items-baseline gap-3">
              <span class="font-bold text-warm-gray-500 w-14 text-right text-base">Start</span>
              <span class="font-semibold">Ultimo Coffee 15th &amp; Mifflin</span>
            </div>
            <div class="flex items-baseline gap-3">
              <span class="font-bold text-warm-gray-500 w-14 text-right text-base">End</span>
              <span class="font-semibold">Marine Parade Grounds</span>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="flex items-center justify-center mb-10 w-full max-w-lg mx-auto">
          <div class="text-center flex-1">
            <div class="text-[10px] md:text-sm text-warm-gray-500 uppercase tracking-widest mb-1 md:mb-2">Meet</div>
            <div class="text-2xl md:text-5xl font-black">7:20<span class="text-sm md:text-2xl font-bold text-warm-gray-400">am</span></div>
          </div>
          <div class="flex items-center flex-shrink-0 mx-1 md:mx-3">
            <div class="w-4 md:w-10 h-px bg-warm-gray-700"></div>
            <svg class="w-4 h-4 md:w-6 md:h-6 text-warm-gray-700 -ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div class="text-center flex-1">
            <div class="text-[10px] md:text-sm text-warm-gray-500 uppercase tracking-widest mb-1 md:mb-2">Roll</div>
            <div class="text-2xl md:text-5xl font-black">7:30<span class="text-sm md:text-2xl font-bold text-warm-gray-400">am</span></div>
          </div>
          <div class="flex items-center flex-shrink-0 mx-1 md:mx-3">
            <div class="w-4 md:w-10 h-px bg-warm-gray-700"></div>
            <svg class="w-4 h-4 md:w-6 md:h-6 text-warm-gray-700 -ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div class="text-center flex-1">
            <div class="text-[10px] md:text-sm text-warm-gray-500 uppercase tracking-widest mb-1 md:mb-2">Arrive</div>
            <div class="text-2xl md:text-5xl font-black">8:00<span class="text-sm md:text-2xl font-bold text-warm-gray-400">am</span></div>
          </div>
        </div>

        <!-- Coffee callout -->
        <div class="bg-white/10 backdrop-blur-sm rounded-2xl px-8 py-5 text-center max-w-sm mb-8">
          <p class="text-warm-gray-400 text-sm mb-1">Can't make the ride?</p>
          <p class="text-xl font-bold mb-1">Join us for coffee!</p>
          <p class="text-warm-gray-300 font-medium">8:00 &ndash; 9:00am &bull; Marine Parade Grounds</p>
        </div>

        <!-- Scroll hint -->
        <div class="animate-bounce text-warm-gray-600 mt-auto">
          <svg class="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7"/></svg>
        </div>

      </div>
    </div>
  {/if}

  <!-- ============================================ -->
  <!-- REGULAR ROUTE SECTION                        -->
  <!-- ============================================ -->
  <div class="bg-white">
    <div class="max-w-2xl mx-auto px-6 py-8">

      <!-- Route header -->
      <div class="flex items-start justify-between mb-6">
        <div class="flex items-center gap-3">
          {#if route?.start_location_icon_url}
            <img src={route.start_location_icon_url} alt="" class="w-12 h-12 object-contain rounded-lg" />
          {/if}
          <div>
            <h2 class="text-2xl font-bold text-warm-gray-900">{route?.name || 'Navy Yard'}</h2>
            {#if route?.departure_time}
              <p class="text-warm-gray-600 text-sm">Departs {formatTime(route.departure_time)}</p>
            {/if}
          </div>
        </div>
        {#if isLive}
          <div class="flex items-center gap-2 px-3 py-1 bg-green-500 text-white text-sm font-semibold rounded-full">
            <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            Live
          </div>
        {/if}
      </div>

      {#if loading}
        <div class="text-center py-16">
          <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>

      {:else if !route}
        <div class="text-center py-16">
          <p class="text-warm-gray-600">Route not found</p>
          <a href="/browse" class="btn btn-primary mt-4 inline-block">Browse Rides</a>
        </div>

      {:else}

        <!-- Map -->
        {#if route.waypoints}
          <div class="h-64 rounded-xl overflow-hidden mb-6">
            <Map waypoints={route.waypoints} showMarkers={false} />
          </div>
        {/if}

        <!-- Next ride -->
        {#if nextRide}
          <div class="bg-warm-gray-50 rounded-xl p-5 mb-6">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs text-warm-gray-500 uppercase tracking-wider mb-1">Next Ride</div>
                <div class="text-lg font-bold text-warm-gray-900">{formatDate(nextRide.date)}</div>
                <div class="text-sm text-warm-gray-600">{formatTime(route.departure_time)}</div>
              </div>
              {#if isLive}
                <button on:click={startTracking} class="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow transition-colors">
                  Track Live
                </button>
              {:else}
                <span class="text-sm text-warm-gray-400">Scheduled</span>
              {/if}
            </div>
          </div>
        {:else}
          <div class="bg-warm-gray-50 rounded-xl p-5 mb-6 text-center text-warm-gray-500">
            No upcoming rides scheduled
          </div>
        {/if}

        <!-- Other upcoming dates -->
        {#if otherRides.length > 0}
          <div class="mb-8">
            <h3 class="text-sm font-bold text-warm-gray-900 mb-3">Upcoming Dates</h3>
            <div class="space-y-2">
              {#each otherRides as ride}
                <div class="flex items-center justify-between p-3 border border-warm-gray-200 rounded-lg">
                  <div class="font-medium text-warm-gray-900 text-sm">
                    {formatDate(ride.date)}
                    {#if ride.date.split('T')[0] === SPECIAL_DATE}
                      <span class="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">Special Event</span>
                    {/if}
                  </div>
                  {#if ride.status === 'live'}
                    <span class="text-xs text-green-600 font-semibold">Live Now</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Description -->
        {#if route.description}
          <div class="mb-8">
            <Markdown content={route.description} className="text-warm-gray-600 text-sm" />
          </div>
        {/if}

        <div class="border-t border-warm-gray-100 pt-4 text-center">
          <a href="/browse" class="text-sm text-primary hover:text-secondary font-medium">Browse all rides</a>
        </div>

      {/if}
    </div>
  </div>

{/if}
