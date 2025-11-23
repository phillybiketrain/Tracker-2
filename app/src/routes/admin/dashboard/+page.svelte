<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let role = '';
  let region = 'philly';
  let stats = null;
  let pendingRoutes = [];
  let loading = true;

  onMount(() => {
    // Check if logged in
    token = localStorage.getItem('admin_token');
    role = localStorage.getItem('admin_role');
    region = localStorage.getItem('admin_region') || 'philly';

    if (!token) {
      goto('/admin');
      return;
    }

    loadData();
  });

  async function loadData() {
    loading = true;

    try {
      // Load stats and pending routes in parallel
      const [statsRes, pendingRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats?region=${region}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/admin/routes/pending?region=${region}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!statsRes.ok || !pendingRes.ok) {
        if (statsRes.status === 401 || pendingRes.status === 401) {
          // Token expired, redirect to login
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load data');
      }

      const statsData = await statsRes.json();
      const pendingData = await pendingRes.json();

      stats = statsData.data;
      pendingRoutes = pendingData.data;

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      loading = false;
    }
  }

  async function approveRoute(routeId) {
    if (!confirm('Approve this route?')) return;

    try {
      const res = await fetch(`${API_URL}/admin/routes/${routeId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to approve');

      // Reload data
      await loadData();

    } catch (err) {
      alert('Failed to approve route');
      console.error(err);
    }
  }

  async function rejectRoute(routeId) {
    if (!confirm('Reject and delete this route? This cannot be undone.')) return;

    try {
      const res = await fetch(`${API_URL}/admin/routes/${routeId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to reject');

      // Reload data
      await loadData();

    } catch (err) {
      alert('Failed to reject route');
      console.error(err);
    }
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_region');
    goto('/admin');
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>Admin Dashboard - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Admin Dashboard</h1>
          <p class="text-sm text-warm-gray-600 mt-1">
            {role === 'super' ? 'Super Admin' : 'Regional Admin'} • {region}
          </p>
        </div>

        <div class="flex items-center gap-4">
          {#if role === 'super'}
            <a href="/admin/regions" class="text-sm text-warm-gray-700 hover:text-warm-gray-900">
              Regions
            </a>
          {/if}
          <a href="/admin/email-blast" class="text-sm text-warm-gray-700 hover:text-warm-gray-900">
            Email Blast
          </a>
          <a href="/admin/templates" class="text-sm text-warm-gray-700 hover:text-warm-gray-900">
            Templates
          </a>
          <button on:click={logout} class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
            Logout
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-8">
    {#if loading}
      <div class="text-center py-12">
        <p class="text-warm-gray-600">Loading...</p>
      </div>
    {:else}
      <!-- Stats -->
      {#if stats}
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div class="bg-white rounded-lg border border-warm-gray-200 p-4">
            <div class="text-2xl font-bold text-warm-gray-900">{stats.total_routes}</div>
            <div class="text-xs text-warm-gray-600 mt-1">Approved Routes</div>
          </div>

          <div class="bg-white rounded-lg border border-warm-gray-200 p-4">
            <div class="text-2xl font-bold text-orange-600">{stats.pending_routes}</div>
            <div class="text-xs text-warm-gray-600 mt-1">Pending Approval</div>
          </div>

          <div class="bg-white rounded-lg border border-warm-gray-200 p-4">
            <div class="text-2xl font-bold text-warm-gray-900">{stats.upcoming_rides}</div>
            <div class="text-xs text-warm-gray-600 mt-1">Upcoming Rides</div>
          </div>

          <div class="bg-white rounded-lg border border-warm-gray-200 p-4">
            <div class="text-2xl font-bold text-green-600">{stats.live_rides}</div>
            <div class="text-xs text-warm-gray-600 mt-1">Live Now</div>
          </div>

          <div class="bg-white rounded-lg border border-warm-gray-200 p-4">
            <div class="text-2xl font-bold text-warm-gray-900">{stats.total_subscribers}</div>
            <div class="text-xs text-warm-gray-600 mt-1">Subscribers</div>
          </div>
        </div>
      {/if}

      <!-- Pending Routes -->
      <div class="bg-white rounded-lg border border-warm-gray-200">
        <div class="px-6 py-4 border-b border-warm-gray-200">
          <h2 class="text-lg font-bold text-warm-gray-900">Pending Route Approvals</h2>
          <p class="text-sm text-warm-gray-600 mt-1">{pendingRoutes.length} routes awaiting review</p>
        </div>

        {#if pendingRoutes.length === 0}
          <div class="px-6 py-12 text-center">
            <p class="text-warm-gray-600">No pending routes</p>
          </div>
        {:else}
          <div class="divide-y divide-warm-gray-100">
            {#each pendingRoutes as route (route.id)}
              <div class="px-6 py-4 hover:bg-warm-gray-50">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h3 class="font-semibold text-warm-gray-900">{route.name}</h3>
                    {#if route.description}
                      <p class="text-sm text-warm-gray-600 mt-1">{route.description}</p>
                    {/if}
                    <div class="flex items-center gap-4 mt-2 text-xs text-warm-gray-600">
                      <span>Departs: {route.departure_time}</span>
                      {#if route.estimated_duration}
                        <span>Duration: {route.estimated_duration}</span>
                      {/if}
                      <span>Tag: {route.tag}</span>
                      <span>Rides: {route.scheduled_rides_count}</span>
                    </div>
                    <div class="text-xs text-warm-gray-500 mt-1">
                      Created {formatDate(route.created_at)}
                      {#if route.creator_email}• {route.creator_email}{/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 ml-4">
                    <button
                      on:click={() => approveRoute(route.id)}
                      class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      on:click={() => rejectRoute(route.id)}
                      class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
