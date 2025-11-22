<script>
  import { onMount } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL } from '$lib/config.js';

  let step = 'creating'; // creating | broadcasting | success
  let activeStep = 1; // 1 = details, 2 = map, 3 = schedule
  let waypoints = [];
  let routeName = '';
  let description = '';
  let departureTime = '08:00';
  let estimatedDuration = '';
  let selectedDates = [];
  let accessCode = '';
  let routeId = '';
  let broadcasting = false;
  let followerCount = 0;
  let currentLocation = null;
  let socket = null;
  let watchId = null;

  function handleMapClick(coords) {
    if (step === 'creating') {
      waypoints = [...waypoints, coords];
    }
  }

  function toggleStep(stepNum) {
    activeStep = activeStep === stepNum ? 0 : stepNum;
  }

  function clearRoute() {
    waypoints = [];
  }

  function removeWaypoint(index) {
    waypoints = waypoints.filter((_, i) => i !== index);
  }

  function useCurrentLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          waypoints = [...waypoints, {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }];
        },
        (error) => {
          alert('Could not get your location: ' + error.message);
        }
      );
    }
  }

  function nextStep() {
    if (activeStep === 1) {
      if (!routeName || !departureTime) {
        alert('Fill in required fields');
        return;
      }
      activeStep = 2;
    } else if (activeStep === 2) {
      if (waypoints.length < 2) {
        alert('Add at least 2 waypoints');
        return;
      }
      activeStep = 3;
    } else if (activeStep === 3) {
      if (selectedDates.length === 0) {
        alert('Select at least one date');
        return;
      }
      createRoute();
    }
  }

  async function createRoute() {
    try {
      // Create route
      const routeRes = await fetch(`${API_URL}/api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: routeName,
          description,
          waypoints,
          departure_time: departureTime,
          estimated_duration: estimatedDuration
        })
      });

      const routeData = await routeRes.json();

      if (!routeData.success) {
        throw new Error('Failed to create route');
      }

      accessCode = routeData.data.access_code;
      routeId = routeData.data.id;

      // Schedule instances
      const scheduleRes = await fetch(
        `${API_URL}/api/routes/${accessCode}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dates: selectedDates })
        }
      );

      const scheduleData = await scheduleRes.json();

      if (!scheduleData.success) {
        throw new Error('Failed to schedule rides');
      }

      step = 'success';

    } catch (error) {
      alert('Error creating route: ' + error.message);
      console.error(error);
    }
  }

  function startBroadcasting() {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
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
      step = 'broadcasting';

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
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    if (socket) {
      socket.emit('ride:end', { accessCode });
      socket.disconnect();
    }

    broadcasting = false;
    alert('Ride ended!');
    window.location.href = '/';
  }

  // Generate dates for next 30 days
  function getNext30Days() {
    const dates = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
  }

  function toggleDate(date) {
    if (selectedDates.includes(date)) {
      selectedDates = selectedDates.filter(d => d !== date);
    } else {
      selectedDates = [...selectedDates, date];
    }
  }

  onMount(() => {
    return () => {
      if (socket) socket.disconnect();
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  });
</script>

<svelte:head>
  <title>Lead a Ride - Philly Bike Train</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">

  {#if step === 'creating'}
    <!-- Route Creation Accordion -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2 text-warm-gray-900">Create a Route</h1>
      <p class="text-warm-gray-600">Follow the steps below to create your bike train route</p>
    </div>

    <div class="max-w-4xl mx-auto space-y-4">

      <!-- Step 1: Route Details -->
      <div class="card overflow-hidden">
        <button
          on:click={() => toggleStep(1)}
          class="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-warm-gray-50 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h2 class="text-xl font-bold text-warm-gray-900">Route Details</h2>
              <p class="text-sm text-warm-gray-600">Name, time, and description</p>
            </div>
          </div>
          <svg
            class="w-6 h-6 text-warm-gray-400 transition-transform {activeStep === 1 ? 'rotate-180' : ''}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if activeStep === 1}
          <div class="px-6 pb-6 pt-2 border-t border-warm-gray-100 accordion-content">
            <div class="space-y-4">
              <div>
                <label class="block font-semibold mb-2 text-warm-gray-900">Route Name *</label>
                <input
                  bind:value={routeName}
                  type="text"
                  placeholder="e.g., Market St Commuter"
                  class="input w-full"
                />
              </div>

              <div>
                <label class="block font-semibold mb-2 text-warm-gray-900">Description</label>
                <textarea
                  bind:value={description}
                  placeholder="Brief description of your route"
                  class="input w-full h-24"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block font-semibold mb-2 text-warm-gray-900">Departure Time *</label>
                  <input
                    bind:value={departureTime}
                    type="time"
                    class="input w-full"
                  />
                </div>

                <div>
                  <label class="block font-semibold mb-2 text-warm-gray-900">Duration (optional)</label>
                  <input
                    bind:value={estimatedDuration}
                    type="text"
                    placeholder="e.g., 45 minutes"
                    class="input w-full"
                  />
                </div>
              </div>

              <div class="pt-4">
                <button
                  on:click={nextStep}
                  disabled={!routeName || !departureTime}
                  class="btn btn-primary w-full disabled:opacity-50"
                >
                  Next: Draw Route →
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Step 2: Draw Route on Map -->
      <div class="card overflow-hidden">
        <button
          on:click={() => toggleStep(2)}
          class="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-warm-gray-50 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h2 class="text-xl font-bold text-warm-gray-900">Draw Route</h2>
              <p class="text-sm text-warm-gray-600">
                {waypoints.length === 0 ? 'Click on map to add waypoints' : `${waypoints.length} waypoint${waypoints.length === 1 ? '' : 's'} added`}
              </p>
            </div>
          </div>
          <svg
            class="w-6 h-6 text-warm-gray-400 transition-transform {activeStep === 2 ? 'rotate-180' : ''}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if activeStep === 2}
          <div class="px-6 pb-6 pt-2 border-t border-warm-gray-100 accordion-content">
            <p class="text-warm-gray-600 mb-4">Click on the map to add waypoints • Click markers to remove them</p>

            <div class="mb-4 flex gap-2">
              <button on:click={useCurrentLocation} class="btn btn-secondary">
                Use My Location
              </button>
              <button on:click={clearRoute} class="btn btn-secondary">
                Clear All
              </button>
            </div>

            <div class="h-[500px] w-full mb-4">
              <Map {waypoints} onMapClick={handleMapClick} onMarkerClick={removeWaypoint} />
            </div>

            <div class="pt-4">
              <button
                on:click={nextStep}
                disabled={waypoints.length < 2}
                class="btn btn-primary w-full disabled:opacity-50"
              >
                Next: Schedule Rides →
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Step 3: Schedule Dates -->
      <div class="card overflow-hidden">
        <button
          on:click={() => toggleStep(3)}
          class="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-warm-gray-50 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h2 class="text-xl font-bold text-warm-gray-900">Schedule Rides</h2>
              <p class="text-sm text-warm-gray-600">
                {selectedDates.length === 0 ? 'Select dates to run this route' : `${selectedDates.length} date${selectedDates.length === 1 ? '' : 's'} selected`}
              </p>
            </div>
          </div>
          <svg
            class="w-6 h-6 text-warm-gray-400 transition-transform {activeStep === 3 ? 'rotate-180' : ''}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if activeStep === 3}
          <div class="px-6 pb-6 pt-2 border-t border-warm-gray-100 accordion-content">
            <p class="mb-4 text-gray-600">Select dates (you can select multiple):</p>

            <div class="grid grid-cols-7 gap-2 mb-6">
              {#each getNext30Days() as date}
                {@const isSelected = selectedDates.includes(date)}
                {@const dateObj = new Date(date)}

                <button
                  on:click={() => toggleDate(date)}
                  class="p-2 rounded text-sm border transition-colors {isSelected ? 'bg-primary text-white border-primary' : 'hover:border-primary'}"
                >
                  <div class="font-bold">{dateObj.getDate()}</div>
                  <div class="text-xs">{dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                </button>
              {/each}
            </div>

            {#if selectedDates.length > 0}
              <div class="mb-4 p-3 bg-blue-50 rounded">
                <p class="font-medium">Selected dates:</p>
                <p class="text-sm text-gray-600">
                  {selectedDates.map(d => new Date(d).toLocaleDateString()).join(', ')}
                </p>
              </div>
            {/if}

            <div class="pt-4">
              <button
                on:click={nextStep}
                disabled={selectedDates.length === 0}
                class="btn btn-primary w-full disabled:opacity-50"
              >
                Create Route
              </button>
            </div>
          </div>
        {/if}
      </div>

    </div>

  {:else if step === 'success'}
    <!-- Success Screen -->
    <div class="max-w-2xl mx-auto">
      <div class="card text-center">
        <h1 class="text-4xl font-bold mb-6 text-warm-gray-900">Route Created</h1>

        <div class="bg-warm-gray-50 rounded-2xl p-8 mb-6">
          <p class="text-sm text-warm-gray-600 mb-3 font-semibold">Your Access Code</p>
          <div class="text-6xl font-bold text-primary mb-6 tracking-tight">{accessCode}</div>
          <button
            on:click={() => navigator.clipboard.writeText(accessCode)}
            class="btn btn-secondary"
          >
            Copy Code
          </button>
        </div>

        <p class="text-warm-gray-600 mb-8">
          Save this code. You'll need it to start broadcasting on your scheduled dates.
        </p>

        <div class="space-y-3">
          <button on:click={startBroadcasting} class="btn btn-primary w-full">
            Start Broadcasting Now
          </button>

          <a href="/browse" class="btn btn-secondary w-full block">
            Browse All Rides
          </a>

          <a href="/" class="btn btn-secondary w-full block">
            Back to Home
          </a>
        </div>
      </div>
    </div>

  {:else if step === 'broadcasting'}
    <!-- Broadcasting Screen -->
    <div class="fixed inset-0 pt-[60px] flex flex-col">
      <div class="bg-white border-b border-warm-gray-200 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="text-sm font-semibold text-warm-gray-900">Broadcasting</span>
          </div>
          <div class="h-4 w-px bg-warm-gray-300"></div>
          <span class="font-bold text-warm-gray-900">{routeName}</span>
          <div class="h-4 w-px bg-warm-gray-300"></div>
          <span class="text-sm text-warm-gray-600">{followerCount} {followerCount === 1 ? 'follower' : 'followers'}</span>
        </div>
        <button on:click={stopBroadcasting} class="btn btn-danger text-sm px-4 py-2">
          End Ride
        </button>
      </div>

      <div class="flex-1 relative">
        <Map {waypoints} autoCenter={true} leaderLocation={currentLocation} />
      </div>
    </div>
  {/if}

</div>

<style>
  .accordion-content {
    animation: accordionSlide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    transform-origin: top;
  }

  @keyframes accordionSlide {
    0% {
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
