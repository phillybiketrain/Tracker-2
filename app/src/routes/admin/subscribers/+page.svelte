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
  let showImportModal = false;
  let importText = '';
  let importing = false;
  let importResult = null;

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

  function parseEmails(text) {
    // Split by newlines, commas, semicolons, or spaces
    return text
      .split(/[\n,;\s]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0);
  }

  async function importSubscribers() {
    const emails = parseEmails(importText);

    if (emails.length === 0) {
      alert('Please enter at least one email address');
      return;
    }

    importing = true;
    importResult = null;

    try {
      const res = await fetch(`${API_URL}/admin/subscribers/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ region, emails })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      importResult = data;

      // Refresh the list
      await loadSubscribers();

    } catch (err) {
      alert('Import failed: ' + err.message);
      console.error(err);
    } finally {
      importing = false;
    }
  }

  function closeImportModal() {
    showImportModal = false;
    importText = '';
    importResult = null;
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
            on:click={() => showImportModal = true}
            class="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
          >
            Import
          </button>
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

<!-- Import Modal -->
{#if showImportModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
      <h3 class="text-lg font-bold text-warm-gray-900 mb-4">Import Subscribers</h3>

      {#if importResult}
        <!-- Results -->
        <div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div class="text-green-800 font-medium mb-2">Import Complete</div>
          <div class="text-sm text-green-700 space-y-1">
            <div>{importResult.imported} imported</div>
            <div>{importResult.skipped} skipped (already subscribed)</div>
          </div>
        </div>
        <div class="flex justify-end">
          <button
            on:click={closeImportModal}
            class="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      {:else}
        <!-- Input -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-warm-gray-700 mb-2">
            Email Addresses
          </label>
          <textarea
            bind:value={importText}
            placeholder="Paste email addresses here (one per line, or comma/space separated)"
            rows="8"
            class="w-full px-3 py-2 border border-warm-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-mono"
          ></textarea>
          <p class="text-xs text-warm-gray-500 mt-2">
            Imported subscribers will be marked as verified and subscribed to all routes.
          </p>
        </div>

        <div class="flex justify-end gap-3">
          <button
            on:click={closeImportModal}
            class="px-4 py-2 text-sm text-warm-gray-700 hover:bg-warm-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            on:click={importSubscribers}
            disabled={importing || !importText.trim()}
            class="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
