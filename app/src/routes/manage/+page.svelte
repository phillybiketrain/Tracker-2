<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';
  import Markdown from '$lib/components/Markdown.svelte';

  let accessCode = '';
  let route = null;
  let upcomingRides = [];
  let loading = false;
  let error = '';
  let success = '';

  // Date selection
  let selectedDates = [];
  let currentMonthOffset = 0; // 0 = current month, 1 = next month, etc.
  let uploadingIcon = false;
  let iconFile = null;

  onMount(() => {
    // Check if access code is in URL or localStorage
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

      // Save to localStorage for easy access
      localStorage.setItem('my_route_code', accessCode);

      // Load upcoming scheduled rides
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

  async function addDates() {
    if (selectedDates.length === 0) {
      error = 'Please select at least one date';
      return;
    }

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

      if (!data.success) {
        error = data.error || 'Failed to schedule rides';
        return;
      }

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

  function prevMonth() {
    if (currentMonthOffset > 0) {
      currentMonthOffset--;
    }
  }

  function toggleDate(dateStr) {
    if (selectedDates.includes(dateStr)) {
      selectedDates = selectedDates.filter(d => d !== dateStr);
    } else {
      selectedDates = [...selectedDates, dateStr];
    }
  }

  $: availableDates = getDatesForMonth(currentMonthOffset);

  // Parse date string (YYYY-MM-DD or ISO timestamp) in local timezone
  function parseLocalDate(dateStr) {
    // Extract just the date portion if it's an ISO timestamp
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(dateString) {
    return parseLocalDate(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  async function deleteRide(rideId, rideDate) {
    if (!confirm(`Delete the ride scheduled for ${formatDate(rideDate)}?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/rides/${rideId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: accessCode })
      });

      const data = await res.json();

      if (!data.success) {
        error = data.error || 'Failed to delete ride';
        return;
      }

      success = 'Ride deleted successfully';
      await loadUpcomingRides();

    } catch (err) {
      error = 'Failed to delete ride';
      console.error(err);
    }
  }

  async function uploadIcon() {
    if (!iconFile) {
      error = 'Please select an image file';
      return;
    }

    uploadingIcon = true;
    error = '';
    success = '';

    try {
      const formData = new FormData();
      formData.append('icon', iconFile);

      const res = await fetch(`${API_URL}/routes/${accessCode}/upload-icon`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!data.success) {
        error = data.error || 'Failed to upload icon';
        return;
      }

      success = 'Start location icon updated successfully!';
      route.start_location_icon_url = data.data.start_location_icon_url;
      iconFile = null;

    } catch (err) {
      error = 'Failed to upload icon';
      console.error(err);
    } finally {
      uploadingIcon = false;
    }
  }

  async function deleteIcon() {
    if (!confirm('Remove the current start location icon?')) {
      return;
    }

    uploadingIcon = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/routes/${accessCode}/icon`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (!data.success) {
        error = data.error || 'Failed to delete icon';
        return;
      }

      success = 'Start location icon removed successfully!';
      route.start_location_icon_url = null;

    } catch (err) {
      error = 'Failed to delete icon';
      console.error(err);
    } finally {
      uploadingIcon = false;
    }
  }
</script>

<svelte:head>
  <title>Manage Your Route - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-12">
    <div class="max-w-4xl mx-auto">

      {#if !route}
        <!-- Access Code Entry -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-8">
          <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
            Manage Your Route
          </h1>
          <p class="text-warm-gray-600 mb-8">
            Enter your access code to add more ride dates or view upcoming rides
          </p>

          <div class="mb-6">
            <label class="block text-sm font-medium text-warm-gray-900 mb-2">
              Access Code
            </label>
            <input
              type="text"
              bind:value={accessCode}
              on:keypress={(e) => e.key === 'Enter' && loadRoute()}
              disabled={loading}
              class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., ABC123XYZ"
            />
          </div>

          {#if error}
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          {/if}

          <button
            on:click={loadRoute}
            disabled={loading || !accessCode}
            class="w-full btn btn-primary py-3"
          >
            {loading ? 'Loading...' : 'Access Route'}
          </button>

          <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            <strong>Don't have a route yet?</strong>
            <a href="/lead" class="text-primary hover:underline ml-1">Create one here</a>
          </div>
        </div>

      {:else}
        <!-- Route Management -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-8 mb-6">
          <div class="flex items-start justify-between mb-6">
            <div>
              <h1 class="text-2xl font-bold text-warm-gray-900 mb-1">
                {route.name}
              </h1>
              {#if route.description}
                <Markdown content={route.description} className="text-warm-gray-600" />
              {/if}
              <div class="flex gap-4 mt-2 text-sm text-warm-gray-600">
                <span>Departs: {route.departure_time}</span>
                {#if route.estimated_duration}
                  <span>Duration: ~{route.estimated_duration} min</span>
                {/if}
              </div>
            </div>
            <div class="text-right">
              <div class="text-xs text-warm-gray-500 mb-1">Access Code</div>
              <div class="font-mono text-lg font-bold text-warm-gray-900">{accessCode}</div>
            </div>
          </div>

          {#if success}
            <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              {success}
            </div>
          {/if}

          {#if error}
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          {/if}

          <!-- Start Location Icon -->
          <div class="mb-6 pb-6 border-b border-warm-gray-200">
            <h2 class="text-lg font-bold text-warm-gray-900 mb-2">Start Location Icon</h2>
            <p class="text-sm text-warm-gray-600 mb-4">
              Upload a custom icon (PNG/JPG, max 1MB) to display at your route's starting point
            </p>

            {#if route.start_location_icon_url}
              <div class="flex items-center gap-4 mb-4">
                <img
                  src={route.start_location_icon_url}
                  alt="Start location icon"
                  class="w-24 h-24 object-contain rounded-lg border-2 border-warm-gray-200"
                />
                <div class="flex-1">
                  <p class="text-sm text-warm-gray-700 mb-2">Current icon</p>
                  <button
                    on:click={deleteIcon}
                    disabled={uploadingIcon}
                    class="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Remove Icon
                  </button>
                </div>
              </div>
            {/if}

            <div class="flex gap-3">
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                on:change={(e) => iconFile = e.target.files[0]}
                disabled={uploadingIcon}
                class="flex-1 text-sm text-warm-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-warm-gray-100 file:text-warm-gray-700 hover:file:bg-warm-gray-200"
              />
              <button
                on:click={uploadIcon}
                disabled={uploadingIcon || !iconFile}
                class="btn btn-primary"
              >
                {uploadingIcon ? 'Uploading...' : 'Upload'}
              </button>
            </div>

            {#if iconFile}
              <p class="text-xs text-warm-gray-600 mt-2">
                Selected: {iconFile.name} ({(iconFile.size / 1024).toFixed(1)} KB)
              </p>
            {/if}
          </div>

          <!-- Add More Dates -->
          <div class="mb-6">
            <h2 class="text-lg font-bold text-warm-gray-900 mb-4">Add More Ride Dates</h2>

            {#if selectedDates.length > 0}
              <div class="mb-3 text-sm text-warm-gray-600">
                <span class="font-medium">{selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected</span>
              </div>
            {/if}

            <!-- Month Navigation -->
            <div class="flex items-center justify-between mb-3">
              <button
                on:click={prevMonth}
                disabled={currentMonthOffset === 0}
                class="px-3 py-1 border border-warm-gray-300 rounded hover:bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <div class="font-medium text-warm-gray-900">
                {getMonthName(currentMonthOffset)}
              </div>
              <button
                on:click={nextMonth}
                class="px-3 py-1 border border-warm-gray-300 rounded hover:bg-white text-sm font-medium"
              >
                Next →
              </button>
            </div>

            <!-- Weekday Headers -->
            <div class="grid grid-cols-7 gap-1 mb-1">
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Sun</div>
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Mon</div>
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Tue</div>
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Wed</div>
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Thu</div>
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Fri</div>
              <div class="text-center text-xs font-semibold text-warm-gray-600 py-1">Sat</div>
            </div>

            <!-- Calendar Grid -->
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
              class="btn btn-primary"
            >
              {loading ? 'Adding...' : `Add ${selectedDates.length || ''} Date${selectedDates.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

        <!-- Upcoming Rides -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-8">
          <h2 class="text-lg font-bold text-warm-gray-900 mb-4">
            Upcoming Rides ({upcomingRides.length})
          </h2>

          {#if upcomingRides.length === 0}
            <div class="text-center py-8 text-warm-gray-500">
              No upcoming rides scheduled yet. Add some dates above!
            </div>
          {:else}
            <div class="space-y-3">
              {#each upcomingRides as ride}
                <div class="flex items-center justify-between p-4 border border-warm-gray-200 rounded-lg hover:bg-warm-gray-50">
                  <div>
                    <div class="font-semibold text-warm-gray-900">
                      {formatDate(ride.date)}
                    </div>
                    <div class="text-sm text-warm-gray-600">
                      {ride.departure_time}
                      {#if ride.interest_count > 0}
                        • {ride.interest_count} interested
                      {/if}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    {#if ride.status === 'live'}
                      <span class="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">
                        Live Now
                      </span>
                    {:else if ride.status === 'scheduled'}
                      <a href="/broadcast?code={accessCode}" class="btn btn-primary text-xs px-3 py-1">
                        Start Ride
                      </a>
                      <button
                        on:click={() => deleteRide(ride.id, ride.date)}
                        class="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="mt-6 text-center">
          <button
            on:click={() => { route = null; accessCode = ''; }}
            class="text-sm text-warm-gray-600 hover:text-warm-gray-900"
          >
            Manage a Different Route
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>
