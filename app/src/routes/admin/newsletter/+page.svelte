<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let region = 'philly';
  let newsletters = [];
  let loading = true;
  let creating = false;
  let deleting = null;

  onMount(() => {
    token = localStorage.getItem('admin_token');
    region = localStorage.getItem('admin_region') || 'philly';

    if (!token) {
      goto('/admin');
      return;
    }

    loadNewsletters();
  });

  async function loadNewsletters() {
    loading = true;
    try {
      const res = await fetch(`${API_URL}/admin/newsletters?region=${region}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load newsletters');
      }

      const data = await res.json();
      newsletters = data.data || [];
    } catch (err) {
      console.error('Error loading newsletters:', err);
    } finally {
      loading = false;
    }
  }

  async function createNewsletter() {
    creating = true;
    try {
      const res = await fetch(`${API_URL}/admin/newsletters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          region,
          name: `Newsletter ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        })
      });

      if (!res.ok) throw new Error('Failed to create newsletter');

      const data = await res.json();
      goto(`/admin/newsletter/${data.data.id}`);
    } catch (err) {
      console.error('Error creating newsletter:', err);
      alert('Failed to create newsletter');
    } finally {
      creating = false;
    }
  }

  async function duplicateNewsletter(id) {
    try {
      const res = await fetch(`${API_URL}/admin/newsletters/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to duplicate');

      const data = await res.json();
      goto(`/admin/newsletter/${data.data.id}`);
    } catch (err) {
      console.error('Error duplicating:', err);
      alert('Failed to duplicate newsletter');
    }
  }

  async function deleteNewsletter(id) {
    if (!confirm('Are you sure you want to delete this newsletter?')) return;

    deleting = id;
    try {
      const res = await fetch(`${API_URL}/admin/newsletters/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }

      await loadNewsletters();
    } catch (err) {
      console.error('Error deleting:', err);
      alert(err.message);
    } finally {
      deleting = null;
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-700';
      case 'draft':
      default:
        return 'bg-warm-gray-100 text-warm-gray-700';
    }
  }
</script>

<svelte:head>
  <title>Newsletters - Admin - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Newsletters</h1>
          <p class="text-sm text-warm-gray-600 mt-1">Create and send email newsletters to subscribers</p>
        </div>

        <div class="flex items-center gap-4">
          <a href="/admin/dashboard" class="text-sm text-warm-gray-700 hover:text-warm-gray-900">
            Dashboard
          </a>
          <a href="/admin/email-blast" class="text-sm text-warm-gray-700 hover:text-warm-gray-900">
            Email Blast
          </a>
          <a href="/admin/templates" class="text-sm text-warm-gray-700 hover:text-warm-gray-900">
            Templates
          </a>
        </div>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-8">
    <!-- Create button -->
    <div class="mb-6">
      <button
        on:click={createNewsletter}
        disabled={creating}
        class="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
      >
        {creating ? 'Creating...' : '+ New Newsletter'}
      </button>
    </div>

    {#if loading}
      <div class="text-center py-12">
        <p class="text-warm-gray-600">Loading newsletters...</p>
      </div>
    {:else if newsletters.length === 0}
      <div class="bg-white rounded-lg border border-warm-gray-200 p-12 text-center">
        <div class="text-4xl mb-4">📰</div>
        <h2 class="text-lg font-semibold text-warm-gray-900 mb-2">No newsletters yet</h2>
        <p class="text-warm-gray-600 mb-6">Create your first newsletter to get started.</p>
        <button
          on:click={createNewsletter}
          disabled={creating}
          class="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90"
        >
          Create Newsletter
        </button>
      </div>
    {:else}
      <div class="bg-white rounded-lg border border-warm-gray-200">
        <div class="px-6 py-4 border-b border-warm-gray-200">
          <h2 class="text-lg font-bold text-warm-gray-900">All Newsletters</h2>
          <p class="text-sm text-warm-gray-600 mt-1">{newsletters.length} newsletter(s)</p>
        </div>

        <div class="divide-y divide-warm-gray-100">
          {#each newsletters as newsletter (newsletter.id)}
            <div class="px-6 py-4 hover:bg-warm-gray-50 transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3">
                    <a
                      href="/admin/newsletter/{newsletter.id}"
                      class="font-semibold text-warm-gray-900 hover:text-primary truncate"
                    >
                      {newsletter.name}
                    </a>
                    <span class="px-2 py-0.5 text-xs font-medium rounded {getStatusBadge(newsletter.status)}">
                      {newsletter.status}
                    </span>
                  </div>

                  {#if newsletter.subject}
                    <p class="text-sm text-warm-gray-600 mt-1 truncate">
                      Subject: {newsletter.subject}
                    </p>
                  {/if}

                  <div class="flex items-center gap-4 mt-2 text-xs text-warm-gray-500">
                    <span>Updated {formatDate(newsletter.updated_at)}</span>
                    {#if newsletter.status === 'sent'}
                      <span>Sent to {newsletter.recipient_count} subscribers</span>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <a
                    href="/admin/newsletter/{newsletter.id}"
                    class="px-3 py-1.5 text-sm bg-warm-gray-100 text-warm-gray-700 rounded hover:bg-warm-gray-200 transition-colors"
                  >
                    {newsletter.status === 'sent' ? 'View' : 'Edit'}
                  </a>
                  <button
                    on:click={() => duplicateNewsletter(newsletter.id)}
                    class="px-3 py-1.5 text-sm bg-warm-gray-100 text-warm-gray-700 rounded hover:bg-warm-gray-200 transition-colors"
                  >
                    Duplicate
                  </button>
                  {#if newsletter.status === 'draft'}
                    <button
                      on:click={() => deleteNewsletter(newsletter.id)}
                      disabled={deleting === newsletter.id}
                      class="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                    >
                      {deleting === newsletter.id ? '...' : 'Delete'}
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Help text -->
    <div class="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h3 class="font-medium text-blue-900">About the Newsletter Builder</h3>
      <p class="text-sm text-blue-800 mt-1">
        Build beautiful, mobile-friendly newsletters using blocks. Add text, upcoming rides, photos, and more.
        Preview your newsletter in real-time before sending to your subscribers.
      </p>
    </div>
  </div>
</div>
