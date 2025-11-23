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
        {#if rideInstances.length > 0}
          <div class="bg-white rounded-lg border border-warm-gray-200 p-6 mt-6">
            <h3 class="text-lg font-bold text-warm-gray-900 mb-4">Scheduled Ride Instances ({rideInstances.length})</h3>
            <div class="space-y-2 max-h-96 overflow-y-auto">
              {#each rideInstances as ride}
                <div class="flex items-center justify-between p-3 border border-warm-gray-200 rounded hover:bg-warm-gray-50">
                  <div>
                    <div class="font-medium text-warm-gray-900">
                      {new Date(ride.date).toLocaleDateString('en-US', {
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
                  <a
                    href="/ride/{ride.id}"
                    target="_blank"
                    class="text-sm text-primary hover:text-primary/80 font-medium"
                  >
                    View →
                  </a>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="bg-white rounded-lg border border-warm-gray-200 p-6 mt-6 text-center">
            <p class="text-warm-gray-500">No scheduled ride instances for this route</p>
          </div>
        {/if}
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
                        Last ride: {new Date(route.last_ride_date).toLocaleDateString()}
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
