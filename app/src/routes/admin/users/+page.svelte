<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let role = '';
  let users = [];
  let regions = [];
  let loading = true;
  let showCreateForm = false;

  // Form fields
  let newEmail = '';
  let newPassword = '';
  let newRegion = '';
  let creating = false;
  let error = '';
  let success = '';

  // Get region from URL or default to show all
  let filterRegion = '';

  onMount(() => {
    token = localStorage.getItem('admin_token');
    role = localStorage.getItem('admin_role');

    if (!token || role !== 'super') {
      goto('/admin/dashboard');
      return;
    }

    filterRegion = $page.url.searchParams.get('region') || '';

    loadData();
  });

  async function loadData() {
    loading = true;

    try {
      // Load regions and users in parallel
      const [regionsRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/admin/regions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/admin/users${filterRegion ? `?region=${filterRegion}` : ''}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!regionsRes.ok || !usersRes.ok) {
        if (regionsRes.status === 401 || usersRes.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load data');
      }

      const regionsData = await regionsRes.json();
      const usersData = await usersRes.json();

      regions = regionsData.data;
      users = usersData.data;

      // Set default region for new user form
      if (!newRegion && filterRegion) {
        newRegion = filterRegion;
      }

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      loading = false;
    }
  }

  async function createUser() {
    if (!newEmail || !newPassword || !newRegion) {
      error = 'All fields are required';
      return;
    }

    creating = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          region: newRegion,
          role: 'admin'
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to create user';
        return;
      }

      success = 'Admin user created successfully';
      newEmail = '';
      newPassword = '';
      showCreateForm = false;
      await loadData();

    } catch (err) {
      error = 'Failed to create user';
      console.error(err);
    } finally {
      creating = false;
    }
  }

  async function deleteUser(userId, userEmail) {
    if (!confirm(`Remove admin access for ${userEmail}?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to remove user');
        return;
      }

      success = 'Admin user removed successfully';
      await loadData();

    } catch (err) {
      alert('Failed to remove user');
      console.error(err);
    }
  }

  function getRegionName(regionId) {
    const region = regions.find(r => r.id === regionId);
    return region ? region.name : 'Unknown';
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
  <title>Admin Users - Admin</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Admin Users</h1>
          <p class="text-sm text-warm-gray-600 mt-1">
            {filterRegion ? `Region: ${filterRegion}` : 'All Regions'}
          </p>
        </div>
        <a href="/admin/regions" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
          Back to Regions
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
        <p class="text-warm-gray-600">Loading users...</p>
      </div>
    {:else}
      <!-- Users List -->
      <div class="bg-white rounded-lg border border-warm-gray-200 mb-6">
        <div class="px-6 py-4 border-b border-warm-gray-200 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-warm-gray-900">Admin Users</h2>
            <p class="text-sm text-warm-gray-600 mt-1">{users.length} user{users.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            on:click={() => showCreateForm = !showCreateForm}
            class="px-4 py-2 bg-primary text-white text-sm font-medium rounded hover:bg-primary/90"
          >
            {showCreateForm ? 'Cancel' : 'Add Admin User'}
          </button>
        </div>

        <!-- Create Form -->
        {#if showCreateForm}
          <div class="px-6 py-6 border-b border-warm-gray-200 bg-warm-gray-50">
            <h3 class="font-semibold text-warm-gray-900 mb-4">Create Admin User</h3>

            <div class="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  bind:value={newEmail}
                  disabled={creating}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  bind:value={newPassword}
                  disabled={creating}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Strong password"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Region
                </label>
                <select
                  bind:value={newRegion}
                  disabled={creating}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select region...</option>
                  {#each regions as region}
                    <option value={region.slug}>{region.name}</option>
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
              on:click={createUser}
              disabled={creating || !newEmail || !newPassword || !newRegion}
              class="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Admin User'}
            </button>
          </div>
        {/if}

        <!-- Users Table -->
        <div class="divide-y divide-warm-gray-100">
          {#each users as user (user.id)}
            <div class="px-6 py-4 hover:bg-warm-gray-50">
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-3">
                    <h3 class="font-semibold text-warm-gray-900">{user.email}</h3>
                    <span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                      {user.role}
                    </span>
                  </div>
                  <div class="flex items-center gap-4 mt-1 text-sm text-warm-gray-600">
                    <span>Region: {getRegionName(user.region_id)}</span>
                  </div>
                  <div class="text-xs text-warm-gray-500 mt-1">
                    Created {formatDate(user.created_at)}
                  </div>
                </div>

                <button
                  on:click={() => deleteUser(user.id, user.email)}
                  class="px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          {/each}

          {#if users.length === 0}
            <div class="px-6 py-12 text-center text-warm-gray-500">
              No admin users found for this region
            </div>
          {/if}
        </div>
      </div>

      <div class="p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 class="text-sm font-semibold text-blue-900 mb-2">About Admin Users</h3>
        <ul class="text-sm text-blue-800 space-y-1">
          <li>• Regional admins can only access their assigned region</li>
          <li>• Super admins (environment variable) can access all regions</li>
          <li>• Admins can approve routes, send email blasts, and manage templates</li>
          <li>• Passwords are hashed with bcrypt (12 rounds)</li>
        </ul>
      </div>
    {/if}
  </div>
</div>
