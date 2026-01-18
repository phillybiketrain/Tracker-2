<script>
  import { API_URL } from '$lib/config.js';

  let email = '';
  let loading = false;
  let success = false;
  let error = '';

  async function subscribe() {
    if (!email) {
      error = 'Email is required';
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
          all_routes: true
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

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      subscribe();
    }
  }
</script>

<svelte:head>
  <title>Subscribe - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50 flex items-center justify-center px-6 py-12">
  <div class="w-full max-w-md">
    {#if success}
      <!-- Success State -->
      <div class="bg-white rounded-lg border border-warm-gray-200 p-8 text-center">
        <div class="text-5xl mb-4">🎉</div>
        <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
          You're in!
        </h1>
        <p class="text-warm-gray-600 mb-6">
          Check your inbox for a welcome email. We'll keep you posted on upcoming rides.
        </p>
        <a href="/" class="btn btn-primary">
          Browse Rides
        </a>
      </div>
    {:else}
      <!-- Subscription Form -->
      <div class="bg-white rounded-lg border border-warm-gray-200 p-8">
        <div class="text-center mb-8">
          <div class="text-4xl mb-3">🚴</div>
          <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
            Stay in the loop
          </h1>
          <p class="text-warm-gray-600">
            Get email updates about upcoming Philly Bike Train rides.
          </p>
        </div>

        <div class="space-y-4">
          <input
            type="email"
            bind:value={email}
            on:keydown={handleKeydown}
            disabled={loading}
            class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="your@email.com"
          />

          {#if error}
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          {/if}

          <button
            on:click={subscribe}
            disabled={loading || !email}
            class="w-full btn btn-primary py-3 text-base disabled:opacity-50"
          >
            {loading ? 'Subscribing...' : 'Subscribe'}
          </button>
        </div>

        <p class="mt-6 text-xs text-warm-gray-500 text-center">
          Unsubscribe anytime. No spam, just rides.
        </p>
      </div>
    {/if}
  </div>
</div>
