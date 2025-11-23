<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let loading = true;
  let success = false;
  let error = '';
  let email = '';

  onMount(async () => {
    token = $page.url.searchParams.get('token');

    if (!token) {
      error = 'Invalid unsubscribe link';
      loading = false;
      return;
    }

    // Automatically unsubscribe
    await unsubscribe();
  });

  async function unsubscribe() {
    loading = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/subscriptions/unsubscribe?token=${token}`);
      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to unsubscribe';
        loading = false;
        return;
      }

      email = data.email;
      success = true;

    } catch (err) {
      error = 'Failed to unsubscribe. Please try again.';
      console.error(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Unsubscribe - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50 flex items-center justify-center px-6">
  <div class="max-w-md w-full">
    {#if loading}
      <!-- Loading State -->
      <div class="bg-white rounded-lg border border-warm-gray-200 p-8 text-center">
        <div class="text-4xl mb-4">⏳</div>
        <p class="text-warm-gray-600">Unsubscribing...</p>
      </div>

    {:else if success}
      <!-- Success State -->
      <div class="bg-white rounded-lg border border-warm-gray-200 p-8 text-center">
        <div class="text-6xl mb-4">👋</div>
        <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
          You've been unsubscribed
        </h1>
        <p class="text-warm-gray-600 mb-6">
          {email} will no longer receive weekly bike train updates.
        </p>
        <a href="/subscribe" class="btn btn-primary">
          Resubscribe
        </a>
        <a href="/" class="block mt-3 text-sm text-warm-gray-600 hover:text-warm-gray-900">
          Back to Home
        </a>
      </div>

    {:else if error}
      <!-- Error State -->
      <div class="bg-white rounded-lg border border-warm-gray-200 p-8 text-center">
        <div class="text-6xl mb-4">❌</div>
        <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">
          Something went wrong
        </h1>
        <p class="text-warm-gray-600 mb-6">
          {error}
        </p>
        <a href="/" class="btn btn-primary">
          Back to Home
        </a>
      </div>
    {/if}
  </div>
</div>
