<script>
  import { onMount } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import GpxUpload from '$lib/components/GpxUpload.svelte';
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
  let currentMonthOffset = 0; // 0 = current month, 1 = next month, etc.
  let routeInputMode = 'draw'; // 'draw' or 'gpx'
  let gpxFileName = null;

  function handleMapClick(coords) {
    waypoints = [...waypoints, coords];
  }

  function toggleStep(stepNum) {
    activeStep = activeStep === stepNum ? 0 : stepNum;
  }

  function clearRoute() {
    waypoints = [];
    gpxFileName = null;
  }

  function handleGpxImport(event) {
    waypoints = event.detail.waypoints;
    gpxFileName = event.detail.fileName;
    routeInputMode = 'draw'; // Switch to map view to show/edit the imported route
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
          estimated_duration: estimatedDuration ? `${estimatedDuration} min` : '',
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

  // Get dates for a specific month (0 = current, 1 = next, etc.)
  function getDatesForMonth(monthOffset) {
    const dates = [];
    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

    // Get first and last day of target month
    const firstDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

    // Start from today if we're in current month, otherwise from 1st
    let startDate;
    if (monthOffset === 0) {
      startDate = today;
    } else {
      startDate = firstDay;
    }

    // Generate dates from start to end of month
    const currentDate = new Date(startDate);
    while (currentDate <= lastDay) {
      // Format date as YYYY-MM-DD in local timezone (not UTC)
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateValue = `${year}-${month}-${day}`;

      dates.push({
        value: dateValue,
        day: currentDate.getDate(),
        weekday: currentDate.getDay(), // 0 = Sunday, 6 = Saturday
        dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        fullLabel: currentDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        })
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  // Group dates by week for calendar layout
  function getCalendarWeeks(dates) {
    if (dates.length === 0) return [];

    const weeks = [];
    let currentWeek = new Array(7).fill(null);

    dates.forEach((date, index) => {
      const dayOfWeek = date.weekday;

      // First date: fill empty cells before it
      if (index === 0) {
        currentWeek = new Array(7).fill(null);
      }

      currentWeek[dayOfWeek] = date;

      // End of week (Saturday) or last date
      if (dayOfWeek === 6 || index === dates.length - 1) {
        weeks.push([...currentWeek]);
        currentWeek = new Array(7).fill(null);
      }
    });

    return weeks;
  }

  // Get month name for display
  function getMonthName(monthOffset) {
    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function nextMonth() {
    currentMonthOffset++;
  }

  function previousMonth() {
    if (currentMonthOffset > 0) {
      currentMonthOffset--;
    }
  }

  $: availableDates = getDatesForMonth(currentMonthOffset);

  function toggleDate(date) {
    if (selectedDates.includes(date)) {
      selectedDates = selectedDates.filter(d => d !== date);
    } else {
      selectedDates = [...selectedDates, date];
    }
  }
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
              <h2 class="text-xl font-bold text-warm-gray-900">Route Path</h2>
            </div>
            <svg class="w-5 h-5 transition-transform {activeStep === 2 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if activeStep === 2}
            <div class="mt-6">
              <!-- Mode Toggle -->
              <div class="flex gap-2 mb-4">
                <button
                  class="flex-1 py-2 px-4 rounded-lg font-medium transition-colors {routeInputMode === 'draw'
                    ? 'bg-primary text-white'
                    : 'bg-warm-gray-100 text-warm-gray-700 hover:bg-warm-gray-200'}"
                  on:click={() => routeInputMode = 'draw'}
                >
                  Draw on Map
                </button>
                <button
                  class="flex-1 py-2 px-4 rounded-lg font-medium transition-colors {routeInputMode === 'gpx'
                    ? 'bg-primary text-white'
                    : 'bg-warm-gray-100 text-warm-gray-700 hover:bg-warm-gray-200'}"
                  on:click={() => routeInputMode = 'gpx'}
                >
                  Import GPX
                </button>
              </div>

              {#if routeInputMode === 'gpx' && waypoints.length === 0}
                <GpxUpload on:import={handleGpxImport} />
              {:else}
                <!-- GPX Import Success Banner -->
                {#if gpxFileName}
                  <div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex justify-between items-center">
                    <span class="text-green-800 text-sm">
                      Imported from <strong>{gpxFileName}</strong> ({waypoints.length} points)
                    </span>
                    <button on:click={clearRoute} class="text-green-600 hover:text-green-800 text-sm font-medium">
                      Clear
                    </button>
                  </div>
                {/if}

                <div class="h-96 rounded-lg overflow-hidden mb-4">
                  <Map {waypoints} onMapClick={handleMapClick} showAllMarkers={waypoints.length <= 50} />
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
                      {#if waypoints.length > 20}
                        <p class="text-xs text-warm-gray-500 mb-2">
                          Showing first 20 of {waypoints.length} waypoints
                        </p>
                      {/if}
                      {#each waypoints.slice(0, 20) as wp, i}
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

              <!-- Month Navigation -->
              <div class="flex items-center justify-between mb-4">
                <button
                  on:click={previousMonth}
                  disabled={currentMonthOffset === 0}
                  class="px-3 py-2 text-sm rounded border border-warm-gray-300 hover:bg-warm-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                <h3 class="text-lg font-bold text-warm-gray-900">
                  {getMonthName(currentMonthOffset)}
                </h3>
                <button
                  on:click={nextMonth}
                  class="px-3 py-2 text-sm rounded border border-warm-gray-300 hover:bg-warm-gray-50 transition-all"
                >
                  Next →
                </button>
              </div>

              <!-- Calendar Grid -->
              <div class="mb-6">
                {#each getCalendarWeeks(availableDates) as week}
                  <div class="grid grid-cols-7 gap-1 mb-1">
                    {#each week as date}
                      {#if date}
                        <button
                          on:click={() => toggleDate(date.value)}
                          class="aspect-square flex flex-col items-center justify-center rounded border transition-all {selectedDates.includes(date.value)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-warm-gray-700 border-warm-gray-300 hover:border-primary hover:bg-warm-gray-50'}"
                          title={date.fullLabel}
                        >
                          <span class="text-xs {selectedDates.includes(date.value) ? 'text-white/80' : 'text-warm-gray-500'}">{date.dayName}</span>
                          <span class="text-lg font-bold">{date.day}</span>
                        </button>
                      {:else}
                        <!-- Empty cell for alignment -->
                        <div class="aspect-square"></div>
                      {/if}
                    {/each}
                  </div>
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
