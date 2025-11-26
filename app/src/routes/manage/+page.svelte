<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';

  let accessCode = '';
  let route = null;
  let upcomingRides = [];
  let loading = false;
  let error = '';
  let success = '';

  // Date selection
  let selectedDates = [];
  let availableDates = [];
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

    // Generate next 30 days for date selection
    availableDates = getNext30Days();
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
                <p class="text-warm-gray-600">{route.description}</p>
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

            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
              {#each availableDates as date}
                <button
                  on:click={() => toggleDate(date.value)}
                  disabled={loading}
                  class="px-3 py-2 text-sm rounded border transition-all {selectedDates.includes(date.value)
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-warm-gray-700 border-warm-gray-300 hover:border-primary'}"
                >
                  {date.label}
                </button>
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
