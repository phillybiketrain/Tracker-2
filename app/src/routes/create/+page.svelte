<script>
  import { onMount } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import { API_URL } from '$lib/config.js';

  let activeStep = 1; // 1 = details, 2 = map, 3 = schedule
  let waypoints = [];
  let routeName = '';
  let description = '';
  let departureTime = '08:00';
  let estimatedDuration = '';
  let routeTag = 'community';
  let selectedDates = [];
  let accessCode = '';
  let routeId = '';
  let success = false;
  let creating = false;

  function handleMapClick(coords) {
    waypoints = [...waypoints, coords];
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
    creating = true;

    try {
      // Create route
      const routeRes = await fetch(`${API_URL}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: routeName,
          description,
          waypoints,
          departure_time: departureTime,
          estimated_duration: estimatedDuration,
          tag: routeTag
        })
      });

      const routeData = await routeRes.json();

      if (!routeData.success) {
        throw new Error(routeData.error || 'Failed to create route');
      }

      accessCode = routeData.data.access_code;
      routeId = routeData.data.id;

      // Schedule instances
      const scheduleRes = await fetch(
        `${API_URL}/routes/${accessCode}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dates: selectedDates })
        }
      );

      const scheduleData = await scheduleRes.json();

      if (!scheduleData.success) {
        throw new Error(scheduleData.error || 'Failed to schedule rides');
      }

      success = true;

    } catch (error) {
      alert('Error creating route: ' + error.message);
      console.error(error);
    } finally {
      creating = false;
    }
  }

  function getNext30Days() {
    const dates = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        value: date.toISOString().split('T')[0],
        label: date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        })
      });
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

  const availableDates = getNext30Days();
</script>

<svelte:head>
  <title>Create a Route - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-12">
    <div class="max-w-4xl mx-auto">

      {#if success}
        <!-- Success Screen -->
        <div class="card text-center py-16">
          <div class="text-6xl mb-6">🎉</div>
          <h1 class="text-4xl font-bold mb-4 text-warm-gray-900">Route Created!</h1>
          <p class="text-warm-gray-600 mb-6 text-lg">
            Your bike train route has been submitted for approval.
          </p>

          <div class="bg-warm-gray-100 rounded-lg p-6 mb-8 max-w-md mx-auto">
            <div class="text-sm text-warm-gray-600 mb-2">Your Access Code</div>
            <div class="text-3xl font-bold font-mono text-warm-gray-900 mb-3">{accessCode}</div>
            <p class="text-xs text-warm-gray-600">
              Save this code! You'll need it to manage your route and start broadcasting.
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/manage?code={accessCode}" class="btn btn-primary">
              Manage This Route
            </a>
            <a href="/" class="btn btn-secondary">
              Browse Routes
            </a>
          </div>

          <div class="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            <strong>What's next?</strong> An admin will review your route. Once approved,
            it will appear in the browse page. You can add more ride dates or start
            broadcasting from the Manage page using your access code.
          </div>
        </div>

      {:else}
        <!-- Creation Form -->
        <div class="mb-8">
          <h1 class="text-4xl font-bold mb-3 text-warm-gray-900">Create a Route</h1>
          <p class="text-warm-gray-600 text-lg">
            Set up a new bike train route for your community
          </p>
        </div>

        <!-- Step 1: Route Details -->
        <div class="card mb-6">
          <button
            on:click={() => toggleStep(1)}
            class="w-full flex items-center justify-between"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h2 class="text-xl font-bold text-warm-gray-900">Route Details</h2>
            </div>
            <svg class="w-5 h-5 transition-transform {activeStep === 1 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if activeStep === 1}
            <div class="mt-6 space-y-4">
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Route Name <span class="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  bind:value={routeName}
                  placeholder="e.g., Center City to University City"
                  class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Description
                </label>
                <textarea
                  bind:value={description}
                  rows="3"
                  placeholder="Describe your route, who it's for, or any special notes..."
                  class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                ></textarea>
              </div>

              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                    Departure Time <span class="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    bind:value={departureTime}
                    class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    bind:value={estimatedDuration}
                    placeholder="30"
                    class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                    Tag
                  </label>
                  <select
                    bind:value={routeTag}
                    class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="community">Community</option>
                    <option value="regular">Regular</option>
                    <option value="special">Special</option>
                  </select>
                </div>
              </div>

              <button on:click={nextStep} class="btn btn-primary w-full">
                Continue to Map
              </button>
            </div>
          {/if}
        </div>

        <!-- Step 2: Map Route -->
        <div class="card mb-6">
          <button
            on:click={() => toggleStep(2)}
            class="w-full flex items-center justify-between"
            disabled={activeStep < 2}
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full {activeStep >= 2 ? 'bg-primary text-white' : 'bg-warm-gray-300 text-warm-gray-600'} flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h2 class="text-xl font-bold text-warm-gray-900">Draw Your Route</h2>
            </div>
            <svg class="w-5 h-5 transition-transform {activeStep === 2 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if activeStep === 2}
            <div class="mt-6">
              <div class="h-96 rounded-lg overflow-hidden mb-4">
                <Map {waypoints} on:mapClick={(e) => handleMapClick(e.detail)} editable={true} />
              </div>

              <div class="flex gap-3 mb-4">
                <button on:click={useCurrentLocation} class="btn btn-secondary flex-1">
                  Use My Location
                </button>
                <button on:click={clearRoute} class="btn btn-secondary flex-1">
                  Clear Route
                </button>
              </div>

              {#if waypoints.length > 0}
                <div class="mb-4">
                  <div class="text-sm font-medium text-warm-gray-900 mb-2">
                    Waypoints ({waypoints.length})
                  </div>
                  <div class="space-y-2 max-h-40 overflow-y-auto">
                    {#each waypoints as wp, i}
                      <div class="flex items-center justify-between p-2 bg-warm-gray-50 rounded">
                        <span class="text-sm text-warm-gray-700">
                          {i + 1}. {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                        </span>
                        <button
                          on:click={() => removeWaypoint(i)}
                          class="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <button on:click={nextStep} class="btn btn-primary w-full" disabled={waypoints.length < 2}>
                Continue to Schedule
              </button>
            </div>
          {/if}
        </div>

        <!-- Step 3: Schedule Rides -->
        <div class="card mb-6">
          <button
            on:click={() => toggleStep(3)}
            class="w-full flex items-center justify-between"
            disabled={activeStep < 3}
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full {activeStep >= 3 ? 'bg-primary text-white' : 'bg-warm-gray-300 text-warm-gray-600'} flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h2 class="text-xl font-bold text-warm-gray-900">Schedule Rides</h2>
            </div>
            <svg class="w-5 h-5 transition-transform {activeStep === 3 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if activeStep === 3}
            <div class="mt-6">
              <p class="text-sm text-warm-gray-600 mb-4">
                Select the dates you want to run this route
              </p>

              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
                {#each availableDates as date}
                  <button
                    on:click={() => toggleDate(date.value)}
                    class="px-3 py-2 text-sm rounded border transition-all {selectedDates.includes(date.value)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-warm-gray-700 border-warm-gray-300 hover:border-primary'}"
                  >
                    {date.label}
                  </button>
                {/each}
              </div>

              <button
                on:click={nextStep}
                disabled={creating || selectedDates.length === 0}
                class="btn btn-primary w-full"
              >
                {creating ? 'Creating Route...' : `Create Route with ${selectedDates.length} Ride${selectedDates.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          {/if}
        </div>
      {/if}

    </div>
  </div>
</div>
