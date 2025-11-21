<script>
  import { onMount } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { io } from 'socket.io-client';
  import { API_URL } from '$lib/config.js';

  let step = 'draw'; // draw | details | schedule | broadcasting | success
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
  let socket = null;
  let watchId = null;

  function handleMapClick(coords) {
    if (step === 'draw') {
      waypoints = [...waypoints, coords];
    }
  }

  function clearRoute() {
    waypoints = [];
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
    if (step === 'draw') {
      if (waypoints.length < 2) {
        alert('Add at least 2 waypoints');
        return;
      }
      step = 'details';
    } else if (step === 'details') {
      if (!routeName || !departureTime) {
        alert('Fill in required fields');
        return;
      }
      step = 'schedule';
    } else if (step === 'schedule') {
      if (selectedDates.length === 0) {
        alert('Select at least one date');
        return;
      }
      createRoute();
    }
  }

  function prevStep() {
    if (step === 'details') step = 'draw';
    else if (step === 'schedule') step = 'details';
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

  {#if step === 'draw'}
    <!-- Step 1: Draw Route -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2">Create a Route</h1>
      <p class="text-gray-600">Step 1: Draw your route on the map</p>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 h-[600px]">
        <Map {waypoints} onMapClick={handleMapClick} />
      </div>

      <div class="card">
        <h2 class="font-bold text-xl mb-4">Waypoints ({waypoints.length})</h2>

        <div class="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {#each waypoints as wp, i}
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <div class="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                {i + 1}
              </div>
              <div class="flex-1 text-sm">
                {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
              </div>
            </div>
          {/each}
        </div>

        <div class="space-y-2">
          <button on:click={useCurrentLocation} class="btn btn-secondary w-full">
            Use My Location
          </button>

          <button on:click={clearRoute} class="btn btn-secondary w-full">
            Clear Route
          </button>

          <button
            on:click={nextStep}
            disabled={waypoints.length < 2}
            class="btn btn-primary w-full disabled:opacity-50"
          >
            Next: Route Details
          </button>
        </div>

        <p class="text-sm text-warm-gray-500 mt-4">
          Click on the map to add waypoints
        </p>
      </div>
    </div>

  {:else if step === 'details'}
    <!-- Step 2: Route Details -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2 text-warm-gray-900">Route Details</h1>
      <p class="text-warm-gray-600">Step 2: Name your route and set departure time</p>
    </div>

    <div class="max-w-2xl mx-auto card">
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

        <div class="flex gap-4 pt-4">
          <button on:click={prevStep} class="btn btn-secondary flex-1">
            Back
          </button>
          <button on:click={nextStep} class="btn btn-primary flex-1">
            Next: Schedule
          </button>
        </div>
      </div>
    </div>

  {:else if step === 'schedule'}
    <!-- Step 3: Schedule Dates -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2 text-warm-gray-900">Schedule Rides</h1>
      <p class="text-warm-gray-600">Step 3: When will you lead this route?</p>
    </div>

    <div class="max-w-3xl mx-auto card">
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

      <div class="flex gap-4">
        <button on:click={prevStep} class="btn btn-secondary flex-1">
          ← Back
        </button>
        <button
          on:click={nextStep}
          disabled={selectedDates.length === 0}
          class="btn btn-primary flex-1 disabled:opacity-50"
        >
          Create Route
        </button>
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
        <span class="font-semibold">{routeName}</span> · Code: <span class="font-mono font-bold">{accessCode}</span>
      </p>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Followers</div>
        <div class="text-5xl font-bold text-warm-gray-900">{followerCount}</div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">GPS</div>
        <div class="text-xl font-bold text-green-600 mt-2">Active</div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Route</div>
        <div class="text-lg font-bold text-warm-gray-900 truncate mt-1">{routeName}</div>
      </div>

      <div class="card text-center bg-gradient-to-br from-white to-warm-gray-50">
        <div class="text-xs text-warm-gray-500 mb-2">Time</div>
        <div class="text-2xl font-bold text-warm-gray-900 mt-1">{departureTime}</div>
      </div>
    </div>

    <div class="h-[500px] rounded-2xl overflow-hidden">
      <Map {waypoints} autoCenter={true} />
    </div>
  {/if}

</div>
