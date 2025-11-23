<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let password = '';
  let error = '';
  let loading = false;

  async function login() {
    if (!password) {
      error = 'Password is required';
      return;
    }

    loading = true;
    error = '';

    try {
      const res = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          region: 'philly' // Default to Philly
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Login failed';
        loading = false;
        return;
      }

      // Store token and role
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_role', data.role);
      localStorage.setItem('admin_region', data.region || 'philly');

      // Redirect to dashboard
      goto('/admin/dashboard');

    } catch (err) {
      error = 'Login failed. Please try again.';
      console.error(err);
      loading = false;
    }
  }

  function handleKeypress(e) {
    if (e.key === 'Enter') {
      login();
    }
  }
</script>

<svelte:head>
  <title>Admin Login - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50 flex items-center justify-center px-6">
  <div class="max-w-md w-full">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-warm-gray-900 mb-2">Admin Access</h1>
      <p class="text-sm text-warm-gray-600">Philly Bike Train</p>
    </div>

    <div class="bg-white rounded-lg border border-warm-gray-200 p-8">
      <div class="mb-6">
        <label class="block text-sm font-medium text-warm-gray-900 mb-2">
          Password
        </label>
        <input
          type="password"
          bind:value={password}
          on:keypress={handleKeypress}
          disabled={loading}
          class="w-full px-4 py-3 border border-warm-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="Enter admin password"
          autocomplete="current-password"
        />
      </div>

      {#if error}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      {/if}

      <button
        on:click={login}
        disabled={loading || !password}
        class="w-full btn btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>

      <div class="mt-6 pt-6 border-t border-warm-gray-100">
        <a
          href="/"
          class="text-sm text-warm-gray-600 hover:text-warm-gray-900 flex items-center justify-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to home
        </a>
      </div>
    </div>

    <p class="text-center text-xs text-warm-gray-500 mt-6">
      Admin access is restricted to authorized personnel only
    </p>
  </div>
</div>

<style>
  :global(body) {
    background-color: #F9F7F4;
  }
</style>
