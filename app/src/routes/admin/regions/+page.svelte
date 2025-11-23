<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let role = '';
  let regions = [];
  let loading = true;
  let showCreateForm = false;

  // Form fields
  let newSlug = '';
  let newName = '';
  let newTimezone = 'America/New_York';
  let creating = false;
  let error = '';

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu'
  ];

  onMount(() => {
    token = localStorage.getItem('admin_token');
    role = localStorage.getItem('admin_role');

    if (!token || role !== 'super') {
      goto('/admin/dashboard');
      return;
    }

    loadRegions();
  });

  async function loadRegions() {
    loading = true;

    try {
      const res = await fetch(`${API_URL}/admin/regions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load regions');
      }

      const data = await res.json();
      regions = data.data;

    } catch (err) {
      console.error('Error loading regions:', err);
    } finally {
      loading = false;
    }
  }

  async function createRegion() {
    if (!newSlug || !newName || !newTimezone) {
      error = 'All fields are required';
      return;
    }

    creating = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/admin/regions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug: newSlug.toLowerCase().replace(/\s+/g, '-'),
          name: newName,
          timezone: newTimezone
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to create region';
        return;
      }

      // Reset form and reload
      newSlug = '';
      newName = '';
      newTimezone = 'America/New_York';
      showCreateForm = false;
      await loadRegions();

    } catch (err) {
      error = 'Failed to create region';
      console.error(err);
    } finally {
      creating = false;
    }
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>Region Management - Admin</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Region Management</h1>
          <p class="text-sm text-warm-gray-600 mt-1">Super Admin Only</p>
        </div>
        <a href="/admin/dashboard" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
          Back to Dashboard
        </a>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-8">
    {#if loading}
      <div class="text-center py-12">
        <p class="text-warm-gray-600">Loading regions...</p>
      </div>
    {:else}
      <!-- Regions List -->
      <div class="bg-white rounded-lg border border-warm-gray-200 mb-6">
        <div class="px-6 py-4 border-b border-warm-gray-200 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-warm-gray-900">Active Regions</h2>
            <p class="text-sm text-warm-gray-600 mt-1">{regions.length} region{regions.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            on:click={() => showCreateForm = !showCreateForm}
            class="px-4 py-2 bg-primary text-white text-sm font-medium rounded hover:bg-primary/90"
          >
            {showCreateForm ? 'Cancel' : 'Create Region'}
          </button>
        </div>

        <!-- Create Form -->
        {#if showCreateForm}
          <div class="px-6 py-6 border-b border-warm-gray-200 bg-warm-gray-50">
            <h3 class="font-semibold text-warm-gray-900 mb-4">Create New Region</h3>

            <div class="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Slug (URL)
                </label>
                <input
                  type="text"
                  bind:value={newSlug}
                  disabled={creating}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="portland"
                />
                <p class="text-xs text-warm-gray-500 mt-1">Lowercase, no spaces</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  bind:value={newName}
                  disabled={creating}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Portland Bike Train"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Timezone
                </label>
                <select
                  bind:value={newTimezone}
                  disabled={creating}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {#each timezones as tz}
                    <option value={tz}>{tz}</option>
                  {/each}
                </select>
              </div>
            </div>

            {#if error}
              <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            {/if}

            <button
              on:click={createRegion}
              disabled={creating || !newSlug || !newName}
              class="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Region'}
            </button>
          </div>
        {/if}

        <!-- Regions Table -->
        <div class="divide-y divide-warm-gray-100">
          {#each regions as region (region.id)}
            <div class="px-6 py-4 hover:bg-warm-gray-50">
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="font-semibold text-warm-gray-900">{region.name}</h3>
                  <div class="flex items-center gap-4 mt-1 text-sm text-warm-gray-600">
                    <span>Slug: <code class="bg-warm-gray-100 px-2 py-0.5 rounded text-xs">{region.slug}</code></span>
                    <span>Timezone: {region.timezone}</span>
                  </div>
                  <div class="text-xs text-warm-gray-500 mt-1">
                    Created {formatDate(region.created_at)}
                  </div>
                </div>

                <div class="flex gap-2">
                  <a
                    href="/admin/users?region={region.slug}"
                    class="px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded hover:bg-blue-200"
                  >
                    Users
                  </a>
                  <a
                    href="/admin/dashboard?region={region.slug}"
                    class="px-4 py-2 bg-warm-gray-100 text-warm-gray-700 text-sm font-medium rounded hover:bg-warm-gray-200"
                  >
                    Manage
                  </a>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 class="text-sm font-semibold text-blue-900 mb-2">About Regions</h3>
        <ul class="text-sm text-blue-800 space-y-1">
          <li>• Each region has its own routes, rides, and subscribers</li>
          <li>• Regional admins can only manage their assigned region</li>
          <li>• Email templates are automatically copied from Philly when creating a new region</li>
          <li>• Weekly digests are sent at 8 AM in the region's local timezone</li>
        </ul>
      </div>
    {/if}
  </div>
</div>
