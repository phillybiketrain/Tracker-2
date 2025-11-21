<script>
  import { onMount } from 'svelte';

  let rides = [];
  let loading = true;
  let filter = 'today'; // today | tomorrow | week

  onMount(() => {
    loadRides();
  });

  async function loadRides() {
    loading = true;

    try {
      let fromDate = new Date();
      let days = 1;

      if (filter === 'tomorrow') {
        fromDate.setDate(fromDate.getDate() + 1);
        days = 1;
      } else if (filter === 'week') {
        days = 7;
      }

      const fromStr = fromDate.toISOString().split('T')[0];

      const res = await fetch(
        `http://localhost:3001/api/rides?from_date=${fromStr}&days=${days}&limit=50`
      );

      const data = await res.json();

      if (data.success) {
        rides = data.data;
      }

    } catch (error) {
      console.error('Error loading rides:', error);
      alert('Failed to load rides');
    } finally {
      loading = false;
    }
  }

  async function expressInterest(rideId) {
    try {
      // Generate simple session ID
      let sessionId = localStorage.getItem('session_id');
      if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('session_id', sessionId);
      }

      const res = await fetch(
        `http://localhost:3001/api/rides/${rideId}/interest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        }
      );

      const data = await res.json();

      if (data.success) {
        loadRides(); // Reload to show updated count
      }

    } catch (error) {
      console.error('Error expressing interest:', error);
    }
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  $: {
    // Reload rides when filter changes
    loadRides();
  }
</script>

<svelte:head>
  <title>Browse Rides - Philly Bike Train</title>
</svelte:head>

<div class="container mx-auto px-6 py-8">

  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-4xl font-bold mb-6 text-warm-gray-900">Browse Rides</h1>

    <!-- Filters -->
    <div class="flex gap-3">
      <button
        on:click={() => filter = 'today'}
        class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'today' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
      >
        Today
      </button>
      <button
        on:click={() => filter = 'tomorrow'}
        class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'tomorrow' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
      >
        Tomorrow
      </button>
      <button
        on:click={() => filter = 'week'}
        class="px-6 py-3 rounded-2xl font-medium transition-all {filter === 'week' ? 'bg-primary text-white shadow-sm' : 'bg-white text-warm-gray-700 hover:bg-warm-gray-50 border border-warm-gray-200'}"
      >
        This Week
      </button>
    </div>
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="text-center py-16">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-warm-gray-600 text-lg">Loading rides...</p>
    </div>

  <!-- Empty State -->
  {:else if rides.length === 0}
    <div class="card text-center py-16 max-w-md mx-auto">
      <h2 class="text-3xl font-bold mb-3 text-warm-gray-900">No rides scheduled</h2>
      <p class="text-warm-gray-600 mb-8 text-lg">
        Be the first to create a bike train!
      </p>
      <a href="/lead" class="btn btn-primary inline-block">
        Create a Route
      </a>
    </div>

  <!-- Rides List -->
  {:else}
    <div class="space-y-4">
      {#each rides as ride (ride.id)}
        <div class="card hover:shadow-md transition-all bg-white">
          <div class="flex items-start gap-6">
            <!-- Status Indicator -->
            <div class="flex-shrink-0 pt-1">
              {#if ride.status === 'live'}
                <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              {:else}
                <div class="w-3 h-3 bg-warm-gray-300 rounded-full"></div>
              {/if}
            </div>

            <!-- Main Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h3 class="text-2xl font-bold text-warm-gray-900 mb-1">{ride.route_name}</h3>
                  {#if ride.route_description}
                    <p class="text-warm-gray-600 text-sm line-clamp-1">
                      {ride.route_description}
                    </p>
                  {/if}
                </div>

                <div class="flex-shrink-0 text-right">
                  {#if ride.status === 'live'}
                    <span class="inline-block px-3 py-1 bg-green-500 text-white text-sm font-medium rounded-full">
                      Live
                    </span>
                  {:else}
                    <span class="inline-block px-3 py-1 bg-warm-gray-200 text-warm-gray-700 text-sm font-medium rounded-full">
                      Scheduled
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Info Grid -->
              <div class="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Date</div>
                  <div class="font-medium text-warm-gray-900">{formatDate(ride.date)}</div>
                </div>
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Departure</div>
                  <div class="font-medium text-warm-gray-900">{formatTime(ride.departure_time)}</div>
                </div>
                <div>
                  <div class="text-xs text-warm-gray-500 mb-1">Duration</div>
                  <div class="font-medium text-warm-gray-900">{ride.estimated_duration || '—'}</div>
                </div>
              </div>

              <!-- Stats & Actions -->
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-6 text-sm text-warm-gray-600">
                  {#if ride.follower_count > 0}
                    <div>
                      <span class="font-semibold text-warm-gray-900">{ride.follower_count}</span> following
                    </div>
                  {/if}
                  {#if ride.interest_count > 0}
                    <div>
                      <span class="font-semibold text-warm-gray-900">{ride.interest_count}</span> interested
                    </div>
                  {/if}
                </div>

                <div class="flex gap-2">
                  {#if ride.status === 'live'}
                    <a
                      href="/ride/{ride.id}"
                      class="btn btn-primary"
                    >
                      Track Live
                    </a>
                  {:else}
                    <button
                      on:click={() => expressInterest(ride.id)}
                      class="btn btn-secondary"
                    >
                      Interested
                    </button>
                    <a
                      href="/ride/{ride.id}"
                      class="btn btn-primary"
                    >
                      View Details
                    </a>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <p class="text-center text-warm-gray-500 mt-8 text-sm">
      Showing {rides.length} ride{rides.length !== 1 ? 's' : ''}
    </p>
  {/if}

</div>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
