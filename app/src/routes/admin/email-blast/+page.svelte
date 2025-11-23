<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let region = 'philly';
  let subject = '';
  let body = '';
  let sending = false;
  let success = '';
  let error = '';

  onMount(() => {
    token = localStorage.getItem('admin_token');
    region = localStorage.getItem('admin_region') || 'philly';

    if (!token) {
      goto('/admin');
    }
  });

  async function sendBlast() {
    if (!subject || !body) {
      error = 'Subject and body are required';
      return;
    }

    if (!confirm('Send this email blast to all subscribers?')) {
      return;
    }

    sending = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/admin/email/blast`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ region, subject, body })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to send blast';
        return;
      }

      success = data.message;
      subject = '';
      body = '';

    } catch (err) {
      error = 'Failed to send blast';
      console.error(err);
    } finally {
      sending = false;
    }
  }
</script>

<svelte:head>
  <title>Email Blast - Admin</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-warm-gray-900">Email Blast</h1>
        <a href="/admin/dashboard" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
          Back to Dashboard
        </a>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-8">
    <div class="max-w-3xl mx-auto">
      <div class="bg-white rounded-lg border border-warm-gray-200 p-6">
        <div class="mb-6">
          <label class="block text-sm font-medium text-warm-gray-900 mb-2">
            Subject Line
          </label>
          <input
            type="text"
            bind:value={subject}
            disabled={sending}
            class="w-full px-4 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Important Update from Philly Bike Train"
          />
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-warm-gray-900 mb-2">
            Message Body
          </label>
          <textarea
            bind:value={body}
            disabled={sending}
            rows="12"
            class="w-full px-4 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
            placeholder="Write your message here. Plain text only."
          ></textarea>
          <p class="text-xs text-warm-gray-500 mt-2">
            Use plain text. Unsubscribe link will be added automatically.
          </p>
        </div>

        {#if error}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        {/if}

        {#if success}
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            {success}
          </div>
        {/if}

        <div class="flex justify-end gap-3">
          <a href="/admin/dashboard" class="px-6 py-2 border border-warm-gray-300 rounded text-warm-gray-700 hover:bg-warm-gray-50">
            Cancel
          </a>
          <button
            on:click={sendBlast}
            disabled={sending || !subject || !body}
            class="px-6 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Blast'}
          </button>
        </div>
      </div>

      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 class="text-sm font-semibold text-blue-900 mb-2">Note:</h3>
        <p class="text-sm text-blue-800">
          This will send an immediate email to all subscribers in the {region} region.
          Use this for urgent updates like ride cancellations or important announcements.
        </p>
      </div>
    </div>
  </div>
</div>
