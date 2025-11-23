<script>
  import { onMount } from 'svelte';
  import { API_URL } from '$lib/config.js';

  let email = '';
  let allRoutes = false;
  let selectedRouteIds = [];
  let selectedTags = [];
  let routes = [];
  let loading = false;
  let success = false;
  let error = '';

  const tags = [
    { value: 'community', label: 'Community Rides', description: 'Casual rides for anyone' },
    { value: 'regular', label: 'Regular Commutes', description: 'Recurring routes on a schedule' },
    { value: 'special', label: 'Special Events', description: 'One-time rides and events' }
  ];

  onMount(async () => {
    loadRoutes();
  });

  async function loadRoutes() {
    try {
      const res = await fetch(`${API_URL}/routes?region=philly`);
      const data = await res.json();
      routes = data.data || [];
    } catch (err) {
      console.error('Failed to load routes:', err);
    }
  }

  function toggleRoute(routeId) {
    if (selectedRouteIds.includes(routeId)) {
      selectedRouteIds = selectedRouteIds.filter(id => id !== routeId);
    } else {
      selectedRouteIds = [...selectedRouteIds, routeId];
    }
  }

  function toggleTag(tag) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  async function subscribe() {
    if (!email) {
      error = 'Email is required';
      return;
    }

    if (!allRoutes && selectedRouteIds.length === 0 && selectedTags.length === 0) {
      error = 'Please select at least one route, tag, or "All Rides"';
      return;
    }

    loading = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/subscriptions/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          region: 'philly',
          all_routes: allRoutes,
          route_ids: allRoutes ? [] : selectedRouteIds,
          tags: allRoutes ? [] : selectedTags
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to subscribe';
        loading = false;
        return;
      }

      success = true;

    } catch (err) {
      error = 'Failed to subscribe. Please try again.';
      console.error(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Subscribe to Email Updates - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-12">
    <div class="max-w-2xl mx-auto">
      {#if success}
        <!-- Success State -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-8 text-center">
          <div class="text-6xl mb-4">✅</div>
          <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
            You're subscribed!
          </h1>
          <p class="text-warm-gray-600 mb-6">
            Check your email for a confirmation message. You'll receive weekly updates about upcoming rides every Sunday at 8 AM.
          </p>
          <a href="/" class="btn btn-primary">
            Browse Rides
          </a>
        </div>
      {:else}
        <!-- Subscription Form -->
        <div class="bg-white rounded-lg border border-warm-gray-200 p-8">
          <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
            Subscribe to Email Updates
          </h1>
          <p class="text-warm-gray-600 mb-8">
            Get weekly emails every Sunday at 8 AM with upcoming bike train rides.
          </p>

          <!-- Email Input -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-warm-gray-900 mb-2">
              Email Address
            </label>
            <input
              type="email"
              bind:value={email}
              disabled={loading}
              class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="your@email.com"
            />
          </div>

          <!-- All Routes Option -->
          <div class="mb-8">
            <label class="flex items-start gap-3 p-4 border border-warm-gray-300 rounded-lg cursor-pointer hover:bg-warm-gray-50">
              <input
                type="checkbox"
                bind:checked={allRoutes}
                disabled={loading}
                class="mt-1"
              />
              <div>
                <div class="font-semibold text-warm-gray-900">All Rides</div>
                <div class="text-sm text-warm-gray-600">
                  Get updates about all bike train rides in Philadelphia
                </div>
              </div>
            </label>
          </div>

          {#if !allRoutes}
            <!-- Tag Selection -->
            <div class="mb-8">
              <h2 class="text-sm font-medium text-warm-gray-900 mb-3">
                Or select by type:
              </h2>
              <div class="space-y-2">
                {#each tags as tag}
                  <label class="flex items-start gap-3 p-4 border border-warm-gray-300 rounded-lg cursor-pointer hover:bg-warm-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag.value)}
                      on:change={() => toggleTag(tag.value)}
                      disabled={loading}
                      class="mt-1"
                    />
                    <div>
                      <div class="font-semibold text-warm-gray-900">{tag.label}</div>
                      <div class="text-sm text-warm-gray-600">{tag.description}</div>
                    </div>
                  </label>
                {/each}
              </div>
            </div>

            <!-- Route Selection -->
            {#if routes.length > 0}
              <div class="mb-8">
                <h2 class="text-sm font-medium text-warm-gray-900 mb-3">
                  Or select specific routes:
                </h2>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                  {#each routes as route}
                    <label class="flex items-start gap-3 p-3 border border-warm-gray-300 rounded cursor-pointer hover:bg-warm-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedRouteIds.includes(route.id)}
                        on:change={() => toggleRoute(route.id)}
                        disabled={loading}
                        class="mt-1"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold text-warm-gray-900 text-sm">{route.name}</div>
                        {#if route.description}
                          <div class="text-xs text-warm-gray-600 mt-1 line-clamp-2">{route.description}</div>
                        {/if}
                        <div class="text-xs text-warm-gray-500 mt-1">
                          Departs {route.departure_time} • {route.tag}
                        </div>
                      </div>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          {#if error}
            <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          {/if}

          <button
            on:click={subscribe}
            disabled={loading}
            class="w-full btn btn-primary py-3 text-base"
          >
            {loading ? 'Subscribing...' : 'Subscribe'}
          </button>

          <div class="mt-6 text-xs text-warm-gray-600 text-center">
            You'll receive a confirmation email. Unsubscribe anytime via the link in any email.
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
