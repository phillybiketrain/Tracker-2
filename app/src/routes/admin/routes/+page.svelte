<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let region = 'philly';
  let routes = [];
  let loading = true;
  let editing = null;
  let saving = false;
  let error = '';
  let success = '';
  let rideInstances = [];
  let newRideDate = '';
  let addingRide = false;
  let deleteConfirm = null; // Track which ride is being confirmed for deletion
  let currentMonthOffset = 0; // 0 = current month, 1 = next month, etc.
  let selectedDates = [];
  let uploadingIcon = false;
  let iconFile = null;

  onMount(() => {
    token = localStorage.getItem('admin_token');
    region = localStorage.getItem('admin_region') || 'philly';

    if (!token) {
      goto('/admin');
      return;
    }

    loadRoutes();
  });

  async function loadRoutes() {
    loading = true;

    try {
      const res = await fetch(`${API_URL}/admin/routes/all?region=${region}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load routes');
      }

      const data = await res.json();
      routes = data.data;

    } catch (err) {
      console.error('Error loading routes:', err);
    } finally {
      loading = false;
    }
  }

  async function startEdit(route) {
    editing = {
      id: route.id,
      name: route.name,
      description: route.description,
      departure_time: route.departure_time,
      estimated_duration: route.estimated_duration,
      tag: route.tag,
      access_code: route.access_code
    };
    error = '';
    success = '';

    // Reset calendar to current month
    currentMonthOffset = 0;
    selectedDates = [];

    // Load ride instances for this route
    try {
      const res = await fetch(`${API_URL}/rides?route_id=${route.id}&days=365`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        rideInstances = data.data;
      }
    } catch (err) {
      console.error('Error loading ride instances:', err);
    }
  }

  function cancelEdit() {
    editing = null;
    error = '';
    success = '';
  }

  async function saveRoute() {
    if (!editing.name || !editing.departure_time) {
      error = 'Name and departure time are required';
      return;
    }

    saving = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/admin/routes/${editing.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editing.name,
          description: editing.description,
          departure_time: editing.departure_time,
          estimated_duration: editing.estimated_duration ? parseInt(editing.estimated_duration) : null,
          tag: editing.tag
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to save route';
        return;
      }

      success = 'Route saved successfully';
      editing = null;
      await loadRoutes();

    } catch (err) {
      error = 'Failed to save route';
      console.error(err);
    } finally {
      saving = false;
    }
  }

  async function addRideInstance() {
    if (!newRideDate || !editing) {
      return;
    }

    addingRide = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/admin/rides`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route_id: editing.id,
          dates: [newRideDate]
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to add ride';
        return;
      }

      // Reload ride instances
      const ridesRes = await fetch(`${API_URL}/rides?route_id=${editing.id}&days=365`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ridesData = await ridesRes.json();
      if (ridesData.success) {
        rideInstances = ridesData.data;
      }

      newRideDate = '';
      success = 'Ride added successfully';

    } catch (err) {
      error = 'Failed to add ride';
      console.error(err);
    } finally {
      addingRide = false;
    }
  }

  async function confirmDeleteRide(rideId) {
    deleteConfirm = rideId;
    error = '';
    success = '';
  }

  function cancelDelete() {
    deleteConfirm = null;
  }

  async function deleteRideInstance(rideId) {
    try {
      const res = await fetch(`${API_URL}/admin/rides/${rideId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to delete ride';
        deleteConfirm = null;
        return;
      }

      // Reload ride instances
      const ridesRes = await fetch(`${API_URL}/rides?route_id=${editing.id}&days=365`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ridesData = await ridesRes.json();
      if (ridesData.success) {
        rideInstances = ridesData.data;
      }

      success = 'Ride deleted successfully';
      deleteConfirm = null;

    } catch (err) {
      error = 'Failed to delete ride';
      deleteConfirm = null;
      console.error(err);
    }
  }

  // Parse date string (YYYY-MM-DD) in local timezone
  function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
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
        }),
        isPast: currentDate < today
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

  async function uploadIcon() {
    if (!iconFile || !editing) {
      error = 'Please select an image file';
      return;
    }

    uploadingIcon = true;
    error = '';
    success = '';

    try {
      const formData = new FormData();
      formData.append('icon', iconFile);

      const res = await fetch(`${API_URL}/admin/routes/${editing.id}/upload-icon`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to upload icon';
        return;
      }

      success = 'Start location icon updated successfully!';
      editing.start_location_icon_url = data.data.start_location_icon_url;
      iconFile = null;
      await loadRoutes(); // Reload to show updated icon

    } catch (err) {
      error = 'Failed to upload icon';
      console.error(err);
    } finally {
      uploadingIcon = false;
    }
  }

  async function deleteIcon() {
    if (!editing || !confirm('Remove the current start location icon?')) {
      return;
    }

    uploadingIcon = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/admin/routes/${editing.id}/icon`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to delete icon';
        return;
      }

      success = 'Start location icon removed successfully!';
      editing.start_location_icon_url = null;
      await loadRoutes(); // Reload to show change

    } catch (err) {
      error = 'Failed to delete icon';
      console.error(err);
    } finally {
      uploadingIcon = false;
    }
  }

  async function addSelectedRides() {
    if (selectedDates.length === 0 || !editing) {
      return;
    }

    addingRide = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/admin/rides`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route_id: editing.id,
          dates: selectedDates
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to add rides';
        return;
      }

      // Reload ride instances
      const ridesRes = await fetch(`${API_URL}/rides?route_id=${editing.id}&days=365`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ridesData = await ridesRes.json();
      if (ridesData.success) {
        rideInstances = ridesData.data;
      }

      selectedDates = [];
      success = `Added ${data.data.length} ride(s) successfully`;

    } catch (err) {
      error = 'Failed to add rides';
      console.error(err);
    } finally {
      addingRide = false;
    }
  }

  async function deleteRoute(routeId, routeName) {
    if (!confirm(`Delete "${routeName}" and all its scheduled rides? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/routes/${routeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete route');
        return;
      }

      success = 'Route deleted successfully';
      await loadRoutes();

    } catch (err) {
      alert('Failed to delete route');
      console.error(err);
    }
  }

  function getStatusBadge(status) {
    const badges = {
      pending: 'bg-orange-100 text-orange-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  }
</script>

<svelte:head>
  <title>Manage Routes - Admin</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Manage Routes</h1>
          <p class="text-sm text-warm-gray-600 mt-1">{region}</p>
        </div>
        <a href="/admin/dashboard" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
          Back to Dashboard
        </a>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-8">
    {#if success}
      <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
        {success}
      </div>
    {/if}

    {#if loading}
      <div class="text-center py-12">
        <p class="text-warm-gray-600">Loading routes...</p>
      </div>
    {:else if editing}
      <!-- Edit Form -->
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg border border-warm-gray-200 p-6">
          <div class="mb-6">
            <h2 class="text-lg font-bold text-warm-gray-900 mb-1">
              Edit Route
            </h2>
            {#if editing.access_code}
              <div class="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-warm-gray-50 rounded-lg">
                <span class="text-sm text-warm-gray-600 font-medium">Access Code:</span>
                <span class="text-base font-mono font-bold text-primary">{editing.access_code}</span>
                <button
                  on:click={() => navigator.clipboard.writeText(editing.access_code)}
                  class="ml-2 text-xs px-2 py-1 bg-white border border-warm-gray-200 rounded hover:bg-warm-gray-50"
                  title="Copy access code"
                >
                  Copy
                </button>
              </div>
            {/if}
          </div>

          <div class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                Route Name
              </label>
              <input
                type="text"
                bind:value={editing.name}
                disabled={saving}
                class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                Description
              </label>
              <textarea
                bind:value={editing.description}
                disabled={saving}
                rows="3"
                class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              ></textarea>
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Departure Time
                </label>
                <input
                  type="text"
                  bind:value={editing.departure_time}
                  disabled={saving}
                  placeholder="8:00 AM"
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Duration (min)
                </label>
                <input
                  type="number"
                  bind:value={editing.estimated_duration}
                  disabled={saving}
                  placeholder="30"
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Tag
                </label>
                <select
                  bind:value={editing.tag}
                  disabled={saving}
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="community">Community</option>
                  <option value="regular">Regular</option>
                  <option value="special">Special</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Start Location Icon -->
          <div class="mb-6 pb-6 border-t border-warm-gray-200 pt-6">
            <h3 class="text-base font-bold text-warm-gray-900 mb-2">Start Location Icon</h3>
            <p class="text-sm text-warm-gray-600 mb-4">
              Upload a custom icon (PNG/JPG, max 1MB) to display at the route's starting point
            </p>

            {#if editing.start_location_icon_url}
              <div class="flex items-center gap-4 mb-4">
                <img
                  src={editing.start_location_icon_url}
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
                class="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 text-sm"
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

          {#if error}
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          {/if}

          <div class="flex justify-end gap-3">
            <button
              on:click={cancelEdit}
              disabled={saving}
              class="px-6 py-2 border border-warm-gray-300 rounded text-warm-gray-700 hover:bg-warm-gray-50"
            >
              Cancel
            </button>
            <button
              on:click={saveRoute}
              disabled={saving}
              class="px-6 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Route'}
            </button>
          </div>
        </div>

        <!-- Scheduled Ride Instances -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-6 mt-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-warm-gray-900">Scheduled Ride Instances ({rideInstances.length})</h3>
          </div>

          <!-- Add New Ride Form -->
          <div class="mb-4 p-4 bg-warm-gray-50 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <label class="block text-sm font-medium text-warm-gray-900">Add Ride Dates</label>
              {#if selectedDates.length > 0}
                <span class="text-sm text-warm-gray-600">{selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected</span>
              {/if}
            </div>

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

            <!-- Day Labels -->
            <div class="grid grid-cols-7 gap-1 mb-2">
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
                        disabled={date.isPast}
                        class="aspect-square flex items-center justify-center text-sm rounded transition-colors {
                          date.isPast
                            ? 'text-warm-gray-300 cursor-not-allowed'
                            : selectedDates.includes(date.value)
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

            <!-- Add Button -->
            {#if selectedDates.length > 0}
              <button
                on:click={addSelectedRides}
                disabled={addingRide}
                class="w-full px-6 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {addingRide ? 'Adding...' : `Add ${selectedDates.length} Ride${selectedDates.length !== 1 ? 's' : ''}`}
              </button>
            {/if}
          </div>

          {#if success}
            <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              {success}
            </div>
          {/if}

          <!-- Ride Instances List -->
          {#if rideInstances.length > 0}
            <div class="space-y-2 max-h-96 overflow-y-auto">
              {#each rideInstances as ride}
                <div class="flex items-center justify-between p-3 border border-warm-gray-200 rounded hover:bg-warm-gray-50">
                  <div>
                    <div class="font-medium text-warm-gray-900">
                      {parseLocalDate(ride.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div class="text-sm text-warm-gray-600 mt-1">
                      {ride.departure_time}
                      {#if ride.status === 'live'}
                        <span class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Live</span>
                      {:else}
                        <span class="ml-2 px-2 py-0.5 bg-warm-gray-100 text-warm-gray-600 text-xs rounded">{ride.status}</span>
                      {/if}
                      {#if ride.interest_count > 0}
                        <span class="ml-2 text-xs text-warm-gray-500">• {ride.interest_count} interested</span>
                      {/if}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <a
                      href="/ride/{ride.id}"
                      target="_blank"
                      class="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      View
                    </a>
                    {#if deleteConfirm === ride.id}
                      <button
                        on:click={() => deleteRideInstance(ride.id)}
                        class="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Confirm Delete?
                      </button>
                      <button
                        on:click={cancelDelete}
                        class="text-sm text-warm-gray-600 hover:text-warm-gray-700 font-medium"
                      >
                        Cancel
                      </button>
                    {:else}
                      <button
                        on:click={() => confirmDeleteRide(ride.id)}
                        class="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8">
              <p class="text-warm-gray-500">No scheduled ride instances for this route</p>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Routes List -->
      <div class="max-w-6xl mx-auto">
        <div class="bg-white rounded-lg border border-warm-gray-200">
          <div class="px-6 py-4 border-b border-warm-gray-200">
            <h2 class="text-lg font-bold text-warm-gray-900">All Routes</h2>
            <p class="text-sm text-warm-gray-600 mt-1">{routes.length} route{routes.length !== 1 ? 's' : ''}</p>
          </div>

          <div class="divide-y divide-warm-gray-100">
            {#each routes as route (route.id)}
              <div class="px-6 py-4 hover:bg-warm-gray-50">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <h3 class="font-semibold text-warm-gray-900">{route.name}</h3>
                      <span class="px-2 py-0.5 text-xs font-medium rounded {getStatusBadge(route.status)}">
                        {route.status}
                      </span>
                      <span class="px-2 py-0.5 text-xs bg-warm-gray-100 text-warm-gray-700 rounded">
                        {route.tag}
                      </span>
                    </div>

                    {#if route.description}
                      <p class="text-sm text-warm-gray-600 mb-2">{route.description}</p>
                    {/if}

                    <div class="flex gap-6 text-xs text-warm-gray-600">
                      <div>
                        <span class="font-medium">Departs:</span> {route.departure_time}
                      </div>
                      {#if route.estimated_duration}
                        <div>
                          <span class="font-medium">Duration:</span> {route.estimated_duration} min
                        </div>
                      {/if}
                      <div>
                        <span class="font-medium">Scheduled Rides:</span> {route.scheduled_rides_count}
                      </div>
                      {#if route.creator_email}
                        <div>
                          <span class="font-medium">Creator:</span> {route.creator_email}
                        </div>
                      {/if}
                    </div>

                    {#if route.last_ride_date}
                      <div class="text-xs text-warm-gray-500 mt-1">
                        Last ride: {parseLocalDate(route.last_ride_date).toLocaleDateString()}
                      </div>
                    {/if}
                  </div>

                  <div class="flex gap-2 ml-4">
                    <button
                      on:click={() => startEdit(route)}
                      class="px-4 py-2 bg-warm-gray-100 text-warm-gray-700 text-sm font-medium rounded hover:bg-warm-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteRoute(route.id, route.name)}
                      class="px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            {/each}

            {#if routes.length === 0}
              <div class="px-6 py-12 text-center text-warm-gray-500">
                No routes found
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
