<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let region = 'philly';
  let subscribers = [];
  let loading = true;
  let search = '';
  let page = 1;
  let pagination = { total: 0, pages: 1 };
  let deletingId = null;
  let searchTimeout = null;

  onMount(() => {
    token = localStorage.getItem('admin_token');
    region = localStorage.getItem('admin_region') || 'philly';

    if (!token) {
      goto('/admin');
      return;
    }

    loadSubscribers();
  });

  async function loadSubscribers() {
    loading = true;
    try {
      const params = new URLSearchParams({
        region,
        page: page.toString(),
        limit: '50'
      });

      if (search) {
        params.set('search', search);
      }

      const res = await fetch(`${API_URL}/admin/subscribers?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load subscribers');
      }

      const data = await res.json();
      subscribers = data.data;
      pagination = data.pagination;

    } catch (err) {
      console.error('Error loading subscribers:', err);
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      page = 1;
      loadSubscribers();
    }, 300);
  }

  function goToPage(newPage) {
    page = newPage;
    loadSubscribers();
  }

  async function removeSubscriber(id, email) {
    if (!confirm(`Remove ${email} from subscribers?`)) return;

    deletingId = id;
    try {
      const res = await fetch(`${API_URL}/admin/subscribers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to remove');

      // Remove from local list
      subscribers = subscribers.filter(s => s.id !== id);
      pagination.total--;

    } catch (err) {
      alert('Failed to remove subscriber');
      console.error(err);
    } finally {
      deletingId = null;
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function exportCSV() {
    const headers = ['Email', 'Verified', 'Subscribed Date', 'Last Email'];
    const rows = subscribers.map(s => [
      s.email,
      s.verified_at ? 'Yes' : 'No',
      formatDate(s.subscribed_at),
      formatDate(s.last_email_sent)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${region}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>Subscribers - Admin - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Subscribers</h1>
          <p class="text-sm text-warm-gray-600 mt-1">
            {pagination.total} subscriber{pagination.total !== 1 ? 's' : ''} in {region}
          </p>
        </div>

        <div class="flex items-center gap-4">
          <a href="/admin/dashboard" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
            Dashboard
          </a>
          <a href="/admin/newsletter" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
            Newsletter
          </a>
          <button
            on:click={exportCSV}
            class="px-4 py-2 text-sm bg-warm-gray-100 text-warm-gray-700 rounded hover:bg-warm-gray-200"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-6">
    <!-- Search -->
    <div class="mb-6">
      <input
        type="text"
        bind:value={search}
        on:input={handleSearch}
        placeholder="Search by email..."
        class="w-full max-w-md px-4 py-2 border border-warm-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
    </div>

    <!-- Subscribers Table -->
    <div class="bg-white rounded-lg border border-warm-gray-200 overflow-hidden">
      {#if loading}
        <div class="px-6 py-12 text-center">
          <p class="text-warm-gray-600">Loading subscribers...</p>
        </div>
      {:else if subscribers.length === 0}
        <div class="px-6 py-12 text-center">
          <p class="text-warm-gray-600">
            {search ? 'No subscribers match your search' : 'No subscribers yet'}
          </p>
        </div>
      {:else}
        <table class="w-full">
          <thead class="bg-warm-gray-50 border-b border-warm-gray-200">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
                Email
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
                Status
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
                Subscribed
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
                Last Email
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-warm-gray-100">
            {#each subscribers as subscriber (subscriber.id)}
              <tr class="hover:bg-warm-gray-50">
                <td class="px-6 py-4">
                  <span class="text-sm text-warm-gray-900">{subscriber.email}</span>
                </td>
                <td class="px-6 py-4">
                  {#if subscriber.verified_at}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Verified
                    </span>
                  {:else}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                      Pending
                    </span>
                  {/if}
                </td>
                <td class="px-6 py-4 text-sm text-warm-gray-600">
                  {formatDate(subscriber.subscribed_at)}
                </td>
                <td class="px-6 py-4 text-sm text-warm-gray-600">
                  {formatDate(subscriber.last_email_sent)}
                </td>
                <td class="px-6 py-4 text-right">
                  <button
                    on:click={() => removeSubscriber(subscriber.id, subscriber.email)}
                    disabled={deletingId === subscriber.id}
                    class="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deletingId === subscriber.id ? 'Removing...' : 'Remove'}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <!-- Pagination -->
        {#if pagination.pages > 1}
          <div class="px-6 py-4 border-t border-warm-gray-200 flex items-center justify-between">
            <div class="text-sm text-warm-gray-600">
              Page {page} of {pagination.pages}
            </div>
            <div class="flex items-center gap-2">
              <button
                on:click={() => goToPage(page - 1)}
                disabled={page <= 1}
                class="px-3 py-1 text-sm border border-warm-gray-300 rounded hover:bg-warm-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                on:click={() => goToPage(page + 1)}
                disabled={page >= pagination.pages}
                class="px-3 py-1 text-sm border border-warm-gray-300 rounded hover:bg-warm-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
