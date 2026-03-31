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
  $: nextRideDate = nextRide ? nextRide.date.split('T')[0] : null;
  $: nextRideIsSpecial = nextRideDate === SPECIAL_DATE;
  $: showSpecialPromo = !nextRideIsSpecial && new Date(SPECIAL_DATE) > new Date();
  $: allUpcoming = [
    ...(nextRide ? [nextRide] : []),
    ...otherRides
  ];
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
  <div class="min-h-screen bg-white">
    <div class="max-w-2xl mx-auto px-6 py-8">

      <!-- Route header -->
      <div class="flex items-start justify-between mb-6">
        <div class="flex items-center gap-3">
          {#if route?.start_location_icon_url}
            <img src={route.start_location_icon_url} alt="" class="w-12 h-12 object-contain rounded-lg" />
          {/if}
          <div>
            <h1 class="text-2xl font-bold text-warm-gray-900">{route?.name || 'Navy Yard'}</h1>
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
          <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
                <div class="text-sm text-warm-gray-400">
                  {nextRide.status === 'scheduled' ? 'Scheduled' : ''}
                </div>
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

        <!-- May 6 Special Event Promo -->
        {#if showSpecialPromo || nextRideIsSpecial}
          <div class="border-t border-warm-gray-200 pt-8 mt-4">
            <div class="bg-warm-gray-900 text-white rounded-2xl p-6 md:p-8">

              <!-- Co-branding -->
              <div class="flex items-center justify-center gap-4 mb-6">
                <img src="/pbt_logo.png" alt="Philly Bike Train" class="h-14 md:h-16 w-auto invert" onerror="this.style.display='none'" />
                <span class="text-2xl text-warm-gray-500 font-light">&times;</span>
                <img src="/navyyard_logo.png" alt="Navy Yard Philadelphia" class="h-14 md:h-16 w-auto" onerror="this.style.display='none'" />
              </div>

              <div class="text-center mb-5">
                <div class="inline-block px-3 py-0.5 bg-amber-500 text-warm-gray-900 text-xs font-bold uppercase tracking-wider rounded-full mb-3">
                  Special Event
                </div>
                <h2 class="text-3xl md:text-4xl font-black leading-tight mb-1">Ride with us!</h2>
                <p class="text-xl md:text-2xl font-bold text-warm-gray-300">Wednesday, May 6<sup>th</sup></p>
              </div>

              <!-- Start / End -->
              <div class="bg-white/10 rounded-xl p-4 mb-5 max-w-sm mx-auto">
                <div class="flex items-baseline gap-3 mb-1">
                  <span class="font-bold text-sm text-warm-gray-400 w-11">Start:</span>
                  <span class="font-semibold">Ultimo Coffee 15th &amp; Mifflin</span>
                </div>
                <div class="flex items-baseline gap-3">
                  <span class="font-bold text-sm text-warm-gray-400 w-11">End:</span>
                  <span class="font-semibold">Marine Parade Grounds</span>
                </div>
              </div>

              <!-- Timeline -->
              <div class="flex items-center justify-center mb-5">
                <div class="text-center px-3 md:px-4">
                  <div class="text-xs text-warm-gray-400 uppercase tracking-wider mb-1">Meet</div>
                  <div class="text-xl md:text-2xl font-black">7:20am</div>
                </div>
                <div class="text-warm-gray-600 px-1">&rarr;</div>
                <div class="text-center px-3 md:px-4">
                  <div class="text-xs text-warm-gray-400 uppercase tracking-wider mb-1">Roll</div>
                  <div class="text-xl md:text-2xl font-black">7:30am</div>
                </div>
                <div class="text-warm-gray-600 px-1">&rarr;</div>
                <div class="text-center px-3 md:px-4">
                  <div class="text-xs text-warm-gray-400 uppercase tracking-wider mb-1">Arrive</div>
                  <div class="text-xl md:text-2xl font-black">8:00am</div>
                </div>
              </div>

              <!-- Coffee callout -->
              <div class="bg-warm-gray-100 text-warm-gray-900 rounded-xl p-4 max-w-xs mx-auto text-center">
                <p class="text-warm-gray-600 text-xs mb-0.5">Can't make the ride?</p>
                <p class="font-bold text-base mb-0.5">Join us for coffee!</p>
                <p class="font-semibold text-sm">8:00-9:00am &bull; Marine Parade Grounds</p>
              </div>

            </div>
          </div>
        {/if}

        <!-- Footer -->
        <div class="border-t border-warm-gray-100 mt-8 pt-4 text-center">
          <a href="/browse" class="text-sm text-primary hover:text-secondary font-medium">Browse all rides</a>
        </div>

      {/if}
    </div>
  </div>
{/if}
