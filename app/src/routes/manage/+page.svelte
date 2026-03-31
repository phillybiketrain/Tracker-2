<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';
  import Map from '$lib/components/Map.svelte';
  import GpxUpload from '$lib/components/GpxUpload.svelte';

  let accessCode = '';
  let route = null;
  let upcomingRides = [];
  let loading = false;
  let error = '';
  let success = '';

  // Editing state
  let editing = false;
  let editName = '';
  let editDescription = '';
  let editDepartureTime = '';
  let editWaypoints = [];
  let saving = false;
  let routeInputMode = 'draw';
  let gpxFileName = null;

  // Date selection
  let selectedDates = [];
  let currentMonthOffset = 0;

  onMount(() => {
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
      }
    }
  });

  async function loadRoute() {
    if (!accessCode) return;

    loading = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/routes/${accessCode}`);
      const data = await res.json();

      if (!data.success) {
        error = 'Route not found. Check your access code.';
        route = null;
        upcomingRides = [];
        return;
      }

      route = data.data;
      localStorage.setItem('my_route_code', accessCode);
      await loadUpcomingRides();
    } catch (err) {
      error = 'Failed to load route';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function loadUpcomingRides() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${API_URL}/rides?route_id=${route.id}&from_date=${today}&days=60`);
      const data = await res.json();
      if (data.success) {
        upcomingRides = data.data;
      }
    } catch (err) {
      console.error('Failed to load upcoming rides:', err);
    }
  }

  // --- Editing ---

  function startEditing() {
    editName = route.name;
    editDescription = route.description || '';
    editDepartureTime = route.departure_time;
    editWaypoints = [...(route.waypoints || [])];
    gpxFileName = null;
    routeInputMode = 'draw';
    editing = true;
    success = '';
    error = '';
  }

  function cancelEditing() {
    editing = false;
  }

  function handleMapClick(coords) {
    editWaypoints = [...editWaypoints, coords];
  }

  function handleWaypointDrag(index, coords) {
    editWaypoints = editWaypoints.map((wp, i) => i === index ? coords : wp);
  }

  function handleWaypointInsert(afterIndex, coords) {
    editWaypoints = [
      ...editWaypoints.slice(0, afterIndex + 1),
      coords,
      ...editWaypoints.slice(afterIndex + 1)
    ];
  }

  function removeWaypoint(index) {
    editWaypoints = editWaypoints.filter((_, i) => i !== index);
  }

  function clearRoute() {
    editWaypoints = [];
    gpxFileName = null;
  }

  function handleGpxImport(event) {
    editWaypoints = event.detail.waypoints;
    gpxFileName = event.detail.fileName;
    routeInputMode = 'draw';
  }

  function useCurrentLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          editWaypoints = [...editWaypoints, {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }];
        },
        (err) => alert('Could not get your location: ' + err.message)
      );
    }
  }

  async function saveEdits() {
    if (!editName.trim()) { error = 'Route name is required'; return; }
    if (!editDepartureTime) { error = 'Departure time is required'; return; }
    if (editWaypoints.length < 2) { error = 'At least 2 waypoints are required'; return; }

    saving = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/routes/${accessCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          departure_time: editDepartureTime,
          waypoints: editWaypoints
        })
      });

      const data = await res.json();

      if (!data.success) {
        error = data.error || 'Failed to save changes';
        return;
      }

      route = data.data;
      editing = false;
      success = 'Route updated!';
    } catch (err) {
      error = 'Failed to save changes';
      console.error(err);
    } finally {
      saving = false;
    }
  }

  // --- Date Management ---

  async function addDates() {
    if (selectedDates.length === 0) { error = 'Select at least one date'; return; }

    loading = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/routes/${accessCode}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: selectedDates })
      });

      const data = await res.json();
      if (!data.success) { error = data.error || 'Failed to schedule rides'; return; }

      success = `Added ${selectedDates.length} ride${selectedDates.length > 1 ? 's' : ''}!`;
      selectedDates = [];
      await loadUpcomingRides();
    } catch (err) {
      error = 'Failed to add dates';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function deleteRide(rideId, rideDate) {
    if (!confirm(`Delete the ride scheduled for ${formatDate(rideDate)}?`)) return;

    try {
      const res = await fetch(`${API_URL}/rides/${rideId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: accessCode })
      });

      const data = await res.json();
      if (!data.success) { error = data.error || 'Failed to delete ride'; return; }

      success = 'Ride deleted';
      await loadUpcomingRides();
    } catch (err) {
      error = 'Failed to delete ride';
      console.error(err);
    }
  }

  // --- Calendar Helpers ---

  function getDatesForMonth(monthOffset) {
    const dates = [];
    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
    const startDate = monthOffset === 0 ? today : targetMonth;

    const currentDate = new Date(startDate);
    while (currentDate <= lastDay) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      dates.push({
        value: `${year}-${month}-${day}`,
        day: currentDate.getDate(),
        weekday: currentDate.getDay(),
        dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        fullLabel: currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  }

  function getCalendarWeeks(dates) {
    if (dates.length === 0) return [];
    const weeks = [];
    let currentWeek = new Array(7).fill(null);

    dates.forEach((date, index) => {
      if (index === 0) currentWeek = new Array(7).fill(null);
      currentWeek[date.weekday] = date;
      if (date.weekday === 6 || index === dates.length - 1) {
        weeks.push([...currentWeek]);
        currentWeek = new Array(7).fill(null);
      }
    });
    return weeks;
  }

  function getMonthName(monthOffset) {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function nextMonth() { currentMonthOffset++; }
  function prevMonth() { if (currentMonthOffset > 0) currentMonthOffset--; }
  function toggleDate(dateStr) {
    selectedDates = selectedDates.includes(dateStr)
      ? selectedDates.filter(d => d !== dateStr)
      : [...selectedDates, dateStr];
  }

  $: availableDates = getDatesForMonth(currentMonthOffset);

  function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(dateString) {
    return parseLocalDate(dateString).toLocaleDateString('en-US', {
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
</script>

<svelte:head>
  <title>Manage Your Route - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-12">
    <div class="max-w-3xl mx-auto">

      {#if !route}
        <!-- Access Code Entry -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-8">
          <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">Manage Your Route</h1>
          <p class="text-warm-gray-600 mb-8">Enter your access code to edit your route or manage ride dates</p>

          <div class="mb-6">
            <label class="block text-sm font-medium text-warm-gray-900 mb-2">Access Code</label>
            <input
              type="text"
              bind:value={accessCode}
              on:keypress={(e) => e.key === 'Enter' && loadRoute()}
              disabled={loading}
              class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., ABCD"
            />
          </div>

          {#if error}
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
          {/if}

          <button on:click={loadRoute} disabled={loading || !accessCode} class="w-full btn btn-primary py-3">
            {loading ? 'Loading...' : 'Access Route'}
          </button>

          <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            <strong>Don't have a route yet?</strong>
            <a href="/create" class="text-primary hover:underline ml-1">Create one here</a>
          </div>
        </div>

      {:else}

        {#if success}
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{success}</div>
        {/if}
        {#if error}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
        {/if}

        <!-- Route Details / Edit -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-6 mb-6">
          {#if editing}
            <!-- Edit Mode -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-warm-gray-900">Edit Route</h2>
              <button on:click={cancelEditing} class="text-sm text-warm-gray-600 hover:text-warm-gray-900">Cancel</button>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-1">Route Name</label>
                <input
                  type="text"
                  bind:value={editName}
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-1">Description</label>
                <textarea
                  bind:value={editDescription}
                  rows="3"
                  maxlength="2500"
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-1">Departure Time</label>
                <input
                  type="time"
                  bind:value={editDepartureTime}
                  class="px-4 py-2 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <!-- Route Path -->
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">Route Path ({editWaypoints.length} points)</label>

                <div class="flex gap-2 mb-3">
                  <button
                    class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors {routeInputMode === 'draw'
                      ? 'bg-primary text-white' : 'bg-warm-gray-100 text-warm-gray-700 hover:bg-warm-gray-200'}"
                    on:click={() => routeInputMode = 'draw'}
                  >
                    Draw on Map
                  </button>
                  <button
                    class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors {routeInputMode === 'gpx'
                      ? 'bg-primary text-white' : 'bg-warm-gray-100 text-warm-gray-700 hover:bg-warm-gray-200'}"
                    on:click={() => routeInputMode = 'gpx'}
                  >
                    Import GPX
                  </button>
                </div>

                {#if routeInputMode === 'gpx' && editWaypoints.length === 0}
                  <GpxUpload on:import={handleGpxImport} />
                {:else}
                  {#if gpxFileName}
                    <div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                      <span class="text-green-800 text-sm">
                        Imported from <strong>{gpxFileName}</strong> ({editWaypoints.length} points)
                      </span>
                      <button on:click={clearRoute} class="text-green-600 hover:text-green-800 text-sm font-medium">Clear</button>
                    </div>
                  {/if}

                  <div class="h-80 rounded-lg overflow-hidden mb-3">
                    <Map
                      waypoints={editWaypoints}
                      onMapClick={handleMapClick}
                      showAllMarkers={editWaypoints.length <= 50}
                      editable={true}
                      onWaypointDrag={handleWaypointDrag}
                      onWaypointInsert={handleWaypointInsert}
                    />
                  </div>

                  <div class="flex gap-2 mb-3">
                    <button on:click={useCurrentLocation} class="btn btn-secondary text-sm flex-1">Use My Location</button>
                    <button on:click={clearRoute} class="btn btn-secondary text-sm flex-1">Clear Route</button>
                  </div>

                  {#if editWaypoints.length > 0}
                    <div class="max-h-32 overflow-y-auto space-y-1 mb-3">
                      {#if editWaypoints.length > 20}
                        <p class="text-xs text-warm-gray-500">Showing first 20 of {editWaypoints.length} waypoints</p>
                      {/if}
                      {#each editWaypoints.slice(0, 20) as wp, i}
                        <div class="flex items-center justify-between p-1.5 bg-warm-gray-50 rounded text-sm">
                          <span class="text-warm-gray-700">{i + 1}. {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}</span>
                          <button on:click={() => removeWaypoint(i)} class="text-red-600 hover:text-red-800 text-xs">Remove</button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>

              <button
                on:click={saveEdits}
                disabled={saving}
                class="btn btn-primary w-full"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

          {:else}
            <!-- View Mode -->
            <div class="flex items-start justify-between mb-2">
              <h1 class="text-2xl font-bold text-warm-gray-900">{route.name}</h1>
              <div class="text-right flex-shrink-0 ml-4">
                <div class="text-xs text-warm-gray-500">Access Code</div>
                <div class="font-mono text-lg font-bold text-warm-gray-900">{accessCode}</div>
              </div>
            </div>

            {#if route.description}
              <p class="text-warm-gray-600 mb-3">{route.description}</p>
            {/if}

            <div class="flex gap-4 text-sm text-warm-gray-600 mb-4">
              <span>Departs {formatTime(route.departure_time)}</span>
              {#if route.distance_miles}
                <span>{route.distance_miles} mi</span>
              {/if}
            </div>

            {#if route.waypoints && route.waypoints.length > 0}
              <div class="h-48 rounded-lg overflow-hidden mb-4">
                <Map waypoints={route.waypoints} showMarkers={false} />
              </div>
            {/if}

            <button on:click={startEditing} class="btn btn-secondary w-full">
              Edit Route
            </button>
          {/if}
        </div>

        <!-- Upcoming Rides + Add Dates -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-6 mb-6">
          <h2 class="text-lg font-bold text-warm-gray-900 mb-4">
            Rides ({upcomingRides.length})
          </h2>

          {#if upcomingRides.length > 0}
            <div class="space-y-2 mb-6">
              {#each upcomingRides as ride}
                <div class="flex items-center justify-between p-3 border border-warm-gray-200 rounded-lg">
                  <div>
                    <div class="font-medium text-warm-gray-900">{formatDate(ride.date)}</div>
                    <div class="text-sm text-warm-gray-600">{formatTime(ride.departure_time)}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    {#if ride.status === 'live'}
                      <span class="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">Live</span>
                    {:else if ride.status === 'scheduled'}
                      <a href="/broadcast?code={accessCode}" class="btn btn-primary text-xs px-3 py-1">Start</a>
                      <button on:click={() => deleteRide(ride.id, ride.date)} class="text-sm text-red-600 hover:text-red-800">Delete</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-warm-gray-500 text-sm mb-6">No upcoming rides. Add some dates below.</p>
          {/if}

          <!-- Add Dates Calendar -->
          <h3 class="text-sm font-bold text-warm-gray-900 mb-3">Add Ride Dates</h3>

          {#if selectedDates.length > 0}
            <div class="mb-2 text-sm text-warm-gray-600">
              {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected
            </div>
          {/if}

          <div class="flex items-center justify-between mb-3">
            <button
              on:click={prevMonth}
              disabled={currentMonthOffset === 0}
              class="px-3 py-1 border border-warm-gray-300 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &larr;
            </button>
            <div class="font-medium text-warm-gray-900 text-sm">{getMonthName(currentMonthOffset)}</div>
            <button on:click={nextMonth} class="px-3 py-1 border border-warm-gray-300 rounded text-sm font-medium">
              &rarr;
            </button>
          </div>

          <div class="grid grid-cols-7 gap-1 mb-1">
            {#each ['S','M','T','W','T','F','S'] as d}
              <div class="text-center text-xs font-semibold text-warm-gray-500 py-1">{d}</div>
            {/each}
          </div>

          <div class="mb-3">
            {#each getCalendarWeeks(availableDates) as week}
              <div class="grid grid-cols-7 gap-1 mb-1">
                {#each week as date}
                  {#if date}
                    <button
                      on:click={() => toggleDate(date.value)}
                      class="aspect-square flex items-center justify-center text-sm rounded transition-colors {
                        selectedDates.includes(date.value)
                          ? 'bg-primary text-white font-medium'
                          : 'hover:bg-warm-gray-100 text-warm-gray-900'
                      }"
                      title={date.fullLabel}
                    >
                      {date.day}
                    </button>
                  {:else}
                    <div class="aspect-square"></div>
                  {/if}
                {/each}
              </div>
            {/each}
          </div>

          <button
            on:click={addDates}
            disabled={loading || selectedDates.length === 0}
            class="btn btn-primary w-full"
          >
            {loading ? 'Adding...' : `Add ${selectedDates.length || ''} Date${selectedDates.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        <div class="text-center">
          <button
            on:click={() => { route = null; accessCode = ''; editing = false; }}
            class="text-sm text-warm-gray-600 hover:text-warm-gray-900"
          >
            Manage a Different Route
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>
