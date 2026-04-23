<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let loading = true;
  let error = '';
  let gothereConfigured = true;

  /**
   * @type {Array<{
   *   id: string,
   *   access_code: string,
   *   name: string,
   *   departure_time: string,
   *   waypoints_count: number,
   *   recent_dates: string[],
   *   recurrence: 'one-off' | 'weekly' | 'biweekly' | 'monthly',
   *   date: string,
   *   selected: boolean,
   *   result: { status: string, detail?: string, gothereCode?: string, gothereSlug?: string } | null,
   * }>}
   */
  let rows = [];

  let running = false;

  onMount(async () => {
    token = localStorage.getItem('admin_token');
    if (!token) {
      goto('/admin');
      return;
    }
    await loadUnmigrated();
  });

  async function loadUnmigrated() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`${API_URL}/admin/migration/unmigrated`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('admin_token');
        goto('/admin');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      gothereConfigured = !!data.gothere_configured;
      rows = (data.data || []).map((r) => ({
        ...r,
        recurrence: guessRecurrence(r.recent_dates),
        date: nextSensibleDate(r.recent_dates),
        selected: true,
        result: null,
      }));
    } catch (err) {
      error = err.message;
      console.error(err);
    } finally {
      loading = false;
    }
  }

  /**
   * Heuristic: look at the gaps between the last few scheduled dates.
   * If they're ~7 days apart → weekly. ~14 → biweekly. ~28-31 → monthly.
   * Otherwise, default to one-off (operator can override).
   */
  function guessRecurrence(dates) {
    if (!dates || dates.length < 2) return 'one-off';
    const sorted = [...dates].sort();
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
      const b = new Date(sorted[i] + 'T00:00:00Z').getTime();
      gaps.push(Math.round((b - a) / (1000 * 60 * 60 * 24)));
    }
    const avg = gaps.reduce((x, y) => x + y, 0) / gaps.length;
    if (avg >= 6 && avg <= 8) return 'weekly';
    if (avg >= 13 && avg <= 15) return 'biweekly';
    if (avg >= 27 && avg <= 32) return 'monthly';
    return 'one-off';
  }

  /**
   * Next date the user probably wants: the next upcoming scheduled date,
   * or two weeks from today if there are none.
   */
  function nextSensibleDate(dates) {
    const today = todayYMD();
    const upcoming = (dates || []).filter((d) => d >= today).sort()[0];
    if (upcoming) return upcoming;
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }

  function todayYMD() {
    return new Date().toISOString().slice(0, 10);
  }

  async function migrate({ dryRun }) {
    error = '';
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) {
      error = 'Select at least one route.';
      return;
    }
    running = true;
    try {
      const res = await fetch(`${API_URL}/admin/migration/migrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dryRun,
          routes: selected.map((r) => ({
            accessCode: r.access_code,
            recurrence: r.recurrence === 'one-off' ? null : r.recurrence,
            date: r.date,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Migration failed');

      // Fold results back onto rows.
      const byCode = Object.fromEntries((data.results || []).map((x) => [x.accessCode, x]));
      rows = rows.map((r) => (r.selected ? { ...r, result: byCode[r.access_code] ?? null } : r));
    } catch (err) {
      error = err.message;
      console.error(err);
    } finally {
      running = false;
    }
  }

  function statusColor(s) {
    return s === 'migrated' ? 'text-green-700 bg-green-50 border-green-200'
      : s === 'skipped'  ? 'text-warm-gray-700 bg-warm-gray-50 border-warm-gray-200'
      : s === 'dry-run'  ? 'text-blue-700 bg-blue-50 border-blue-200'
      :                    'text-red-700 bg-red-50 border-red-200';
  }
</script>

<svelte:head>
  <title>Migrate routes to Go There — Admin</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <div class="container mx-auto px-6 py-10 max-w-6xl">
    <div class="mb-8">
      <a href="/admin/dashboard" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">← Dashboard</a>
      <h1 class="text-3xl font-bold text-warm-gray-900 mt-2">Migrate routes to Go There</h1>
      <p class="text-warm-gray-600 mt-2">
        Link each pre-existing PBT route to a Go There ride or ride-series.
        The existing 4-char access code stays put — the legacy <code>/go</code> broadcast
        path keeps working. The new Go There code is additive; give it to leaders
        so they can broadcast from the Go There app.
      </p>
    </div>

    {#if !gothereConfigured}
      <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
        <strong>Heads up:</strong> <code>GOTHERE_SERVICE_TOKEN</code> isn't set in the server environment. You can dry-run, but actual migration will fail until the token is added to the Railway variables and the service redeploys.
      </div>
    {/if}

    {#if error}
      <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800">
        {error}
      </div>
    {/if}

    {#if loading}
      <div class="text-warm-gray-600">Loading unmigrated routes…</div>
    {:else if rows.length === 0}
      <div class="card text-center py-12">
        <div class="text-4xl mb-2">✅</div>
        <h2 class="text-xl font-semibold text-warm-gray-900">All caught up</h2>
        <p class="text-warm-gray-600 mt-2">Every approved route is already linked to Go There.</p>
      </div>
    {:else}
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-warm-gray-50 text-warm-gray-700">
              <tr>
                <th class="text-left px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={rows.every((r) => r.selected)}
                    on:change={(e) => { rows = rows.map((r) => ({ ...r, selected: e.target.checked })); }}
                  />
                </th>
                <th class="text-left px-4 py-3">Code</th>
                <th class="text-left px-4 py-3">Name</th>
                <th class="text-left px-4 py-3">Departs</th>
                <th class="text-left px-4 py-3">Recurrence</th>
                <th class="text-left px-4 py-3">First date</th>
                <th class="text-left px-4 py-3">Recent schedule</th>
                <th class="text-left px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-warm-gray-100">
              {#each rows as row (row.id)}
                <tr class="hover:bg-warm-gray-50/40">
                  <td class="px-4 py-3">
                    <input type="checkbox" bind:checked={row.selected} disabled={running || row.result?.status === 'migrated'} />
                  </td>
                  <td class="px-4 py-3 font-mono text-warm-gray-900">{row.access_code}</td>
                  <td class="px-4 py-3 text-warm-gray-900">{row.name}</td>
                  <td class="px-4 py-3 text-warm-gray-600">{row.departure_time?.slice(0, 5)}</td>
                  <td class="px-4 py-3">
                    <select bind:value={row.recurrence} disabled={running || row.result?.status === 'migrated'} class="px-2 py-1 border border-warm-gray-300 rounded text-sm">
                      <option value="one-off">One-off</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </td>
                  <td class="px-4 py-3">
                    <input type="date" bind:value={row.date} disabled={running || row.result?.status === 'migrated'} class="px-2 py-1 border border-warm-gray-300 rounded text-sm" />
                  </td>
                  <td class="px-4 py-3 text-xs text-warm-gray-500">
                    {#if row.recent_dates?.length}
                      {row.recent_dates.slice(0, 3).join(', ')}{row.recent_dates.length > 3 ? '…' : ''}
                    {:else}
                      <span class="text-warm-gray-400">none</span>
                    {/if}
                  </td>
                  <td class="px-4 py-3">
                    {#if row.result}
                      <div class="inline-flex flex-col gap-1 px-2 py-1 rounded border text-xs {statusColor(row.result.status)}">
                        <span class="font-semibold">{row.result.status}</span>
                        {#if row.result.gothereCode}
                          <span>code: <span class="font-mono">{row.result.gothereCode}</span></span>
                        {/if}
                        {#if row.result.detail}
                          <span class="opacity-80">{row.result.detail}</span>
                        {/if}
                      </div>
                    {:else}
                      <span class="text-warm-gray-400 text-xs">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap gap-3 items-center">
        <button class="btn btn-secondary" disabled={running} on:click={() => migrate({ dryRun: true })}>
          Dry-run selected
        </button>
        <button class="btn btn-primary" disabled={running || !gothereConfigured} on:click={() => migrate({ dryRun: false })}>
          {running ? 'Migrating…' : 'Migrate selected'}
        </button>
        <button class="text-sm text-warm-gray-600 hover:text-warm-gray-900 underline" disabled={running} on:click={loadUnmigrated}>
          Reload list
        </button>

        <p class="text-xs text-warm-gray-500 ml-auto">
          Dry-run validates the config and returns what would happen without touching Go There.
        </p>
      </div>
    {/if}
  </div>
</div>
