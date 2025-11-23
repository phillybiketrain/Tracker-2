# Bike Train Tracker - Implementation Guide (Part 3)

**This continues from REBUILD_PLAN_PART2.md**

---

# Part 10: Frontend Stores (Svelte State Management)

### `src/lib/stores/auth.ts`

```typescript
import { writable } from 'svelte/store';

export type AuthState = {
  sessionId: string | null;
  fingerprint: string | null;
  isAdmin: boolean;
  adminToken: string | null;
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    sessionId: null,
    fingerprint: null,
    isAdmin: false,
    adminToken: null
  });

  return {
    subscribe,
    setSession: (sessionId: string, fingerprint: string) => {
      update(state => ({ ...state, sessionId, fingerprint }));
    },
    setAdminToken: (token: string) => {
      update(state => ({ ...state, isAdmin: true, adminToken: token }));
      localStorage.setItem('admin_token', token);
    },
    logout: () => {
      set({ sessionId: null, fingerprint: null, isAdmin: false, adminToken: null });
      localStorage.removeItem('admin_token');
    },
    checkAdminAuth: () => {
      const token = localStorage.getItem('admin_token');
      if (token) {
        update(state => ({ ...state, isAdmin: true, adminToken: token }));
      }
    }
  };
}

export const authStore = createAuthStore();
```

### `src/lib/stores/socket.ts`

```typescript
import { writable } from 'svelte/store';
import { io, Socket } from 'socket.io-client';

export type SocketState = {
  connected: boolean;
  socket: Socket | null;
  currentRide: {
    accessCode: string;
    role: 'leader' | 'follower';
    routeInfo: any;
  } | null;
  lastLocation: {
    lat: number;
    lng: number;
    timestamp: number;
  } | null;
  followerCount: number;
};

function createSocketStore() {
  const { subscribe, set, update } = writable<SocketState>({
    connected: false,
    socket: null,
    currentRide: null,
    lastLocation: null,
    followerCount: 0
  });

  let socket: Socket | null = null;

  return {
    subscribe,
    connect: () => {
      if (socket) return;

      socket = io('http://localhost:3001', {
        path: '/socket.io',
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => {
        console.log('Socket connected');
        update(state => ({ ...state, connected: true, socket }));
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        update(state => ({ ...state, connected: false }));
      });

      socket.on('ride:joined', (data) => {
        update(state => ({
          ...state,
          currentRide: {
            accessCode: data.rideId,
            role: data.role,
            routeInfo: data.routeInfo
          },
          lastLocation: data.lastLocation || null,
          followerCount: data.followerCount || 0
        }));
      });

      socket.on('location:updated', (data) => {
        update(state => ({
          ...state,
          lastLocation: {
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp
          }
        }));
      });

      socket.on('follower:joined', (data) => {
        update(state => ({
          ...state,
          followerCount: data.followerCount
        }));
      });

      socket.on('follower:left', (data) => {
        update(state => ({
          ...state,
          followerCount: data.followerCount
        }));
      });

      socket.on('ride:ended', () => {
        update(state => ({
          ...state,
          currentRide: null,
          lastLocation: null,
          followerCount: 0
        }));
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
        alert(error.message);
      });
    },

    joinRide: (accessCode: string, role: 'leader' | 'follower') => {
      if (!socket) return;
      socket.emit('ride:join', { accessCode, role });
    },

    leaveRide: (accessCode: string) => {
      if (!socket) return;
      socket.emit('ride:leave', { accessCode });
      update(state => ({
        ...state,
        currentRide: null,
        lastLocation: null,
        followerCount: 0
      }));
    },

    endRide: (accessCode: string) => {
      if (!socket) return;
      socket.emit('ride:end', { accessCode });
    },

    updateLocation: (accessCode: string, lat: number, lng: number) => {
      if (!socket) return;
      socket.emit('location:update', { accessCode, lat, lng });
    },

    disconnect: () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      set({
        connected: false,
        socket: null,
        currentRide: null,
        lastLocation: null,
        followerCount: 0
      });
    }
  };
}

export const socketStore = createSocketStore();
```

### `src/lib/stores/ui.ts`

```typescript
import { writable } from 'svelte/store';

export type Toast = {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
};

export type Modal = {
  id: string;
  component: any;
  props?: any;
};

function createUIStore() {
  const { subscribe, update } = writable({
    toasts: [] as Toast[],
    modals: [] as Modal[],
    loading: false
  });

  return {
    subscribe,
    showToast: (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newToast = { id, ...toast };

      update(state => ({
        ...state,
        toasts: [...state.toasts, newToast]
      }));

      // Auto-dismiss after duration
      setTimeout(() => {
        update(state => ({
          ...state,
          toasts: state.toasts.filter(t => t.id !== id)
        }));
      }, toast.duration || 3000);
    },
    dismissToast: (id: string) => {
      update(state => ({
        ...state,
        toasts: state.toasts.filter(t => t.id !== id)
      }));
    },
    showModal: (modal: Omit<Modal, 'id'>) => {
      const id = Math.random().toString(36).substr(2, 9);
      update(state => ({
        ...state,
        modals: [...state.modals, { id, ...modal }]
      }));
    },
    closeModal: (id: string) => {
      update(state => ({
        ...state,
        modals: state.modals.filter(m => m.id !== id)
      }));
    },
    setLoading: (loading: boolean) => {
      update(state => ({ ...state, loading }));
    }
  };
}

export const uiStore = createUIStore();
```

---

# Part 11: Frontend Components

### `src/lib/components/ui/Button.svelte`

```svelte
<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';

  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-error',
    ghost: 'btn-ghost'
  };

  const sizeClasses = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg'
  };
</script>

<button
  {type}
  class="btn {variantClasses[variant]} {sizeClasses[size]}"
  disabled={disabled || loading}
  on:click
>
  {#if loading}
    <span class="loading loading-spinner"></span>
  {/if}
  <slot />
</button>
```

### `src/lib/components/ui/Input.svelte`

```svelte
<script lang="ts">
  export let type: 'text' | 'email' | 'password' | 'number' = 'text';
  export let value: string | number = '';
  export let placeholder = '';
  export let label = '';
  export let error = '';
  export let required = false;
  export let disabled = false;
</script>

<div class="form-control w-full">
  {#if label}
    <label class="label">
      <span class="label-text">
        {label}
        {#if required}<span class="text-error">*</span>{/if}
      </span>
    </label>
  {/if}

  <input
    {type}
    bind:value
    {placeholder}
    {required}
    {disabled}
    class="input input-bordered w-full"
    class:input-error={error}
    on:input
    on:change
    on:blur
  />

  {#if error}
    <label class="label">
      <span class="label-text-alt text-error">{error}</span>
    </label>
  {/if}
</div>
```

### `src/lib/components/ui/Toast.svelte`

```svelte
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';

  $: toasts = $uiStore.toasts;

  const iconMap = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };

  const colorMap = {
    success: 'alert-success',
    error: 'alert-error',
    info: 'alert-info',
    warning: 'alert-warning'
  };
</script>

<div class="toast toast-top toast-end z-50">
  {#each toasts as toast (toast.id)}
    <div class="alert {colorMap[toast.type]} shadow-lg">
      <div>
        <span class="text-xl">{iconMap[toast.type]}</span>
        <span>{toast.message}</span>
      </div>
      <button
        class="btn btn-sm btn-circle btn-ghost"
        on:click={() => uiStore.dismissToast(toast.id)}
      >
        ✕
      </button>
    </div>
  {/each}
</div>
```

### `src/lib/components/maps/Map.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';

  export let center: [number, number] = [-75.1652, 39.9526]; // Philadelphia
  export let zoom = 12;
  export let markers: Array<{ lat: number; lng: number; popup?: string }> = [];
  export let route: Array<{ lat: number; lng: number }> = [];

  let mapContainer: HTMLDivElement;
  let map: mapboxgl.Map;
  let markerObjects: mapboxgl.Marker[] = [];

  onMount(() => {
    mapboxgl.accessToken = PUBLIC_MAPBOX_TOKEN;

    map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [center[0], center[1]],
      zoom
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true
    }), 'top-right');

    return () => {
      map.remove();
    };
  });

  $: if (map && markers) {
    // Clear existing markers
    markerObjects.forEach(m => m.remove());
    markerObjects = [];

    // Add new markers
    markers.forEach(marker => {
      const el = document.createElement('div');
      el.className = 'marker';
      el.style.backgroundImage = 'url(/marker.png)';
      el.style.width = '30px';
      el.style.height = '40px';
      el.style.backgroundSize = '100%';

      const mapMarker = new mapboxgl.Marker(el)
        .setLngLat([marker.lng, marker.lat]);

      if (marker.popup) {
        mapMarker.setPopup(new mapboxgl.Popup().setHTML(marker.popup));
      }

      mapMarker.addTo(map);
      markerObjects.push(mapMarker);
    });
  }

  $: if (map && route.length > 0) {
    // Draw route line
    if (map.getSource('route')) {
      map.removeLayer('route');
      map.removeSource('route');
    }

    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: route.map(p => [p.lng, p.lat])
        }
      }
    });

    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4
      }
    });
  }
</script>

<div bind:this={mapContainer} class="w-full h-full rounded-lg" />

<style>
  :global(.mapboxgl-popup-content) {
    @apply bg-base-200 text-base-content rounded-lg shadow-lg p-4;
  }
</style>
```

### `src/lib/components/RideCard.svelte`

```svelte
<script lang="ts">
  import type { RideInstance } from '$lib/shared/types';
  import { formatDistance, format } from 'date-fns';

  export let ride: RideInstance;
  export let onJoin: (() => void) | undefined = undefined;
  export let onInterest: (() => void) | undefined = undefined;

  $: timeUntil = formatDistance(new Date(ride.start_time), new Date(), { addSuffix: true });
  $: formattedTime = format(new Date(ride.start_time), 'MMM d, h:mm a');
</script>

<div class="card bg-base-200 shadow-lg hover:shadow-xl transition-shadow">
  <div class="card-body">
    <h3 class="card-title">
      {ride.route?.name || 'Unnamed Ride'}
      {#if ride.status === 'in_progress'}
        <span class="badge badge-success">Live</span>
      {:else}
        <span class="badge badge-primary">Scheduled</span>
      {/if}
    </h3>

    <p class="text-sm text-base-content/70">
      {ride.route?.neighborhood || 'Unknown location'}
    </p>

    {#if ride.route?.description}
      <p class="text-sm">{ride.route.description}</p>
    {/if}

    <div class="flex items-center gap-2 text-sm">
      <span class="text-base-content/70">🕐</span>
      <span>{formattedTime}</span>
      <span class="text-base-content/50">({timeUntil})</span>
    </div>

    {#if ride.route?.tags && ride.route.tags.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each ride.route.tags.slice(0, 3) as tag}
          <span class="badge badge-sm" style="background-color: {tag.color}; color: white;">
            {tag.icon || ''} {tag.name}
          </span>
        {/each}
      </div>
    {/if}

    {#if ride.interest_count && ride.interest_count > 0}
      <div class="text-sm text-base-content/70">
        👋 {ride.interest_count} interested
      </div>
    {/if}

    <div class="card-actions justify-end mt-4">
      {#if onInterest}
        <button class="btn btn-sm btn-ghost" on:click={onInterest}>
          👋 Interested
        </button>
      {/if}

      {#if onJoin}
        <button class="btn btn-sm btn-primary" on:click={onJoin}>
          Join Ride
        </button>
      {/if}
    </div>
  </div>
</div>
```

---

# Part 12: Frontend Pages

### `src/routes/+layout.svelte`

```svelte
<script lang="ts">
  import '../app.css';
  import Toast from '$lib/components/ui/Toast.svelte';
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  onMount(() => {
    authStore.checkAdminAuth();
  });
</script>

<div class="min-h-screen bg-base-100">
  <header class="navbar bg-primary text-primary-content">
    <div class="flex-1">
      <a href="/" class="btn btn-ghost normal-case text-xl">🚴 Bike Train Tracker</a>
    </div>
    <div class="flex-none">
      <ul class="menu menu-horizontal px-1">
        <li><a href="/browse">Browse Rides</a></li>
        <li><a href="/lead">Create Ride</a></li>
        <li><a href="/demand">Suggest Route</a></li>
        <li><a href="/subscribe">Subscribe</a></li>
      </ul>
    </div>
  </header>

  <main class="container mx-auto p-4">
    <slot />
  </main>

  <footer class="footer footer-center p-4 bg-base-300 text-base-content mt-8">
    <div>
      <p>© 2024 Bike Train Tracker - Privacy-first bike ride tracking</p>
    </div>
  </footer>

  <Toast />
</div>
```

### `src/routes/+page.svelte`

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<svelte:head>
  <title>Bike Train Tracker - Home</title>
</svelte:head>

<div class="hero min-h-[80vh]">
  <div class="hero-content text-center">
    <div class="max-w-2xl">
      <h1 class="text-5xl font-bold mb-4">🚴 Bike Train Tracker</h1>
      <p class="text-xl mb-8">
        Privacy-first bike ride tracking for communities. Join group rides, track in real-time,
        or create your own routes.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
        <button class="btn btn-primary btn-lg" on:click={() => goto('/browse')}>
          Browse Rides
        </button>

        <button class="btn btn-secondary btn-lg" on:click={() => goto('/lead')}>
          Create a Ride
        </button>

        <button class="btn btn-accent btn-lg" on:click={() => goto('/demand')}>
          Suggest a Route
        </button>

        <button class="btn btn-info btn-lg" on:click={() => goto('/subscribe')}>
          Email Updates
        </button>
      </div>

      <div class="mt-12 text-left max-w-xl mx-auto">
        <h2 class="text-2xl font-bold mb-4">How it works</h2>
        <div class="space-y-4">
          <div class="flex items-start gap-4">
            <span class="text-3xl">1️⃣</span>
            <div>
              <h3 class="font-bold">Browse or Create</h3>
              <p class="text-sm text-base-content/70">
                Find rides in your area or create your own route
              </p>
            </div>
          </div>

          <div class="flex items-start gap-4">
            <span class="text-3xl">2️⃣</span>
            <div>
              <h3 class="font-bold">Track in Real-Time</h3>
              <p class="text-sm text-base-content/70">
                Follow the leader's GPS location on a live map
              </p>
            </div>
          </div>

          <div class="flex items-start gap-4">
            <span class="text-3xl">3️⃣</span>
            <div>
              <h3 class="font-bold">Privacy First</h3>
              <p class="text-sm text-base-content/70">
                No accounts required. Location data auto-deletes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### `src/routes/browse/+page.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { RideInstance } from '$lib/shared/types';
  import Map from '$lib/components/maps/Map.svelte';
  import RideCard from '$lib/components/RideCard.svelte';
  import { uiStore } from '$lib/stores/ui';

  let rides: RideInstance[] = [];
  let loading = true;
  let selectedRegion = 'philadelphia';
  let mapMarkers: Array<{ lat: number; lng: number; popup?: string }> = [];

  onMount(async () => {
    await loadRides();
  });

  async function loadRides() {
    loading = true;
    try {
      const response = await fetch(`/api/v1/rides?region_id=${selectedRegion}&limit=50`);
      const data = await response.json();
      rides = data.data;

      // Update map markers
      mapMarkers = rides.map(ride => ({
        lat: ride.route?.waypoints[0]?.lat || 0,
        lng: ride.route?.waypoints[0]?.lng || 0,
        popup: `<strong>${ride.route?.name}</strong><br>${ride.route?.neighborhood}`
      }));
    } catch (error) {
      console.error('Error loading rides:', error);
      uiStore.showToast({ type: 'error', message: 'Failed to load rides' });
    } finally {
      loading = false;
    }
  }

  async function handleInterest(rideId: string) {
    // TODO: Implement interest functionality
    uiStore.showToast({ type: 'success', message: 'Interest expressed!' });
  }

  $: if (selectedRegion) {
    loadRides();
  }
</script>

<svelte:head>
  <title>Browse Rides - Bike Train Tracker</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <h1 class="text-3xl font-bold">Browse Rides</h1>

    <select class="select select-bordered" bind:value={selectedRegion}>
      <option value="philadelphia">Philadelphia</option>
      <option value="portland">Portland, OR</option>
    </select>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Map -->
    <div class="h-96 lg:h-[600px]">
      <Map {mapMarkers} />
    </div>

    <!-- Ride List -->
    <div class="space-y-4 overflow-y-auto max-h-[600px]">
      {#if loading}
        <div class="flex justify-center p-8">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {:else if rides.length === 0}
        <div class="text-center p-8 text-base-content/50">
          No rides found in this region
        </div>
      {:else}
        {#each rides as ride (ride.id)}
          <RideCard
            {ride}
            onInterest={() => handleInterest(ride.id)}
            onJoin={() => console.log('Join', ride.id)}
          />
        {/each}
      {/if}
    </div>
  </div>
</div>
```

### `src/routes/lead/+page.svelte`

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { uiStore } from '$lib/stores/ui';
  import type { Waypoint } from '$lib/shared/types';

  let name = '';
  let description = '';
  let neighborhood = '';
  let departureTime = '09:00';
  let waypoints: Waypoint[] = [];
  let selectedDate = new Date().toISOString().split('T')[0];
  let loading = false;

  async function handleSubmit() {
    if (!name || waypoints.length < 2) {
      uiStore.showToast({ type: 'error', message: 'Please fill all required fields' });
      return;
    }

    loading = true;

    try {
      // Create route
      const routeResponse = await fetch('/api/v1/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          neighborhood,
          region_id: 'philadelphia',
          departure_time: departureTime,
          waypoints
        })
      });

      const routeData = await routeResponse.json();

      if (!routeResponse.ok) {
        throw new Error(routeData.error?.message || 'Failed to create route');
      }

      // Schedule instance
      const instanceResponse = await fetch(`/api/v1/routes/${routeData.data.id}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: [selectedDate] })
      });

      if (!instanceResponse.ok) {
        throw new Error('Failed to schedule ride');
      }

      uiStore.showToast({ type: 'success', message: 'Ride created successfully!' });

      // Redirect to access code page
      goto(`/lead/access-code/${routeData.data.access_code}`);
    } catch (error: any) {
      console.error('Error creating ride:', error);
      uiStore.showToast({ type: 'error', message: error.message });
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Create Ride - Bike Train Tracker</title>
</svelte:head>

<div class="max-w-2xl mx-auto">
  <h1 class="text-3xl font-bold mb-6">Create a New Ride</h1>

  <form on:submit|preventDefault={handleSubmit} class="space-y-6">
    <Input
      bind:value={name}
      label="Ride Name"
      placeholder="e.g., Morning Commuter Train"
      required
    />

    <Input
      bind:value={description}
      label="Description"
      placeholder="Brief description of the ride"
    />

    <Input
      bind:value={neighborhood}
      label="Neighborhood"
      placeholder="e.g., Center City"
    />

    <div class="grid grid-cols-2 gap-4">
      <Input
        type="time"
        bind:value={departureTime}
        label="Departure Time"
        required
      />

      <Input
        type="date"
        bind:value={selectedDate}
        label="Date"
        required
      />
    </div>

    <div>
      <label class="label">
        <span class="label-text">Route Waypoints (Click map to add)</span>
      </label>
      <div class="h-96 border border-base-300 rounded-lg">
        <!-- TODO: Add interactive map for waypoint selection -->
        <p class="text-center pt-8 text-base-content/50">
          Interactive map coming soon
        </p>
      </div>
    </div>

    <Button type="submit" variant="primary" size="lg" {loading} disabled={waypoints.length < 2}>
      Create Ride
    </Button>
  </form>
</div>
```

---

# Part 13: Background Jobs & Email

### `src/lib/server/jobs/emailDigest.ts`

```typescript
import { subscriptionService } from '../services/SubscriptionService';
import { rideService } from '../services/RideService';
import { sendEmail } from '../utils/email';
import { addDays } from 'date-fns';

export async function sendDailyDigest() {
  console.log('Sending daily email digest...');

  const subscribers = await subscriptionService.getSubscribersByFrequency('daily');

  for (const subscriber of subscribers) {
    try {
      // Get rides for next 2 days matching subscriber preferences
      const rides = await rideService.listUpcomingRides({
        region_id: subscriber.regions[0],
        tag_ids: subscriber.tag_ids,
        days_ahead: 2,
        limit: 10
      });

      if (rides.length === 0) continue;

      await sendEmail({
        to: subscriber.email,
        subject: 'Your Daily Bike Train Digest',
        html: generateEmailHTML(rides, subscriber)
      });

      console.log(`Sent daily digest to ${subscriber.email}`);
    } catch (error) {
      console.error(`Failed to send digest to ${subscriber.email}:`, error);
    }
  }
}

export async function sendWeeklyDigest() {
  console.log('Sending weekly email digest...');

  const subscribers = await subscriptionService.getSubscribersByFrequency('weekly');

  for (const subscriber of subscribers) {
    try {
      const rides = await rideService.listUpcomingRides({
        region_id: subscriber.regions[0],
        tag_ids: subscriber.tag_ids,
        days_ahead: 7,
        limit: 20
      });

      if (rides.length === 0) continue;

      await sendEmail({
        to: subscriber.email,
        subject: 'Your Weekly Bike Train Digest',
        html: generateEmailHTML(rides, subscriber)
      });

      console.log(`Sent weekly digest to ${subscriber.email}`);
    } catch (error) {
      console.error(`Failed to send digest to ${subscriber.email}:`, error);
    }
  }
}

function generateEmailHTML(rides: any[], subscriber: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .ride { border: 1px solid #ddd; padding: 16px; margin: 16px 0; border-radius: 8px; }
        .ride-name { font-size: 18px; font-weight: bold; margin-bottom: 8px; }
        .ride-details { color: #666; font-size: 14px; }
        .unsubscribe { text-align: center; margin-top: 32px; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <h1>🚴 Your Upcoming Bike Rides</h1>
      <p>Here are the rides scheduled in your area:</p>

      ${rides.map(ride => `
        <div class="ride">
          <div class="ride-name">${ride.route?.name}</div>
          <div class="ride-details">
            📍 ${ride.route?.neighborhood}<br>
            🕐 ${new Date(ride.start_time).toLocaleString()}<br>
            ${ride.route?.description || ''}
          </div>
        </div>
      `).join('')}

      <div class="unsubscribe">
        <a href="${process.env.PUBLIC_APP_URL}/unsubscribe/${subscriber.unsubscribe_token}">
          Unsubscribe
        </a>
      </div>
    </body>
    </html>
  `;
}
```

### `src/lib/server/utils/email.ts`

```typescript
import { createTransport } from 'nodemailer';
import { RESEND_API_KEY, FROM_EMAIL } from '../config/env';

const transporter = createTransport({
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  auth: {
    user: 'resend',
    pass: RESEND_API_KEY
  }
});

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}
```

---

# Part 14: Testing

### `tests/unit/RouteService.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { routeService } from '$lib/server/services/RouteService';

describe('RouteService', () => {
  it('should create a route with valid data', async () => {
    const route = await routeService.createRoute({
      name: 'Test Route',
      region_id: 'philadelphia',
      waypoints: [
        { lat: 39.95, lng: -75.16 },
        { lat: 39.96, lng: -75.17 }
      ],
      departure_time: '09:00'
    });

    expect(route).toBeDefined();
    expect(route.name).toBe('Test Route');
    expect(route.access_code).toHaveLength(8);
  });

  it('should reject route with invalid departure time', async () => {
    await expect(
      routeService.createRoute({
        name: 'Test Route',
        region_id: 'philadelphia',
        waypoints: [
          { lat: 39.95, lng: -75.16 },
          { lat: 39.96, lng: -75.17 }
        ],
        departure_time: '25:00' // Invalid
      })
    ).rejects.toThrow();
  });
});
```

---

# Part 15: Deployment Configuration

### `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "sveltekit",
  "regions": ["iad1"],
  "env": {
    "DATABASE_URL": "@database_url",
    "REDIS_URL": "@redis_url",
    "RESEND_API_KEY": "@resend_api_key",
    "JWT_SECRET": "@jwt_secret"
  }
}
```

### `.env.production`

```bash
# Use production environment variables
NODE_ENV=production
PUBLIC_APP_URL=https://your-domain.com
DATABASE_URL=<neon-postgres-url>
REDIS_URL=<upstash-redis-url>
RESEND_API_KEY=<resend-api-key>
JWT_SECRET=<generate-secure-secret>
```

---

# Part 16: Final Deployment Steps

## Step 1: Set up Neon PostgreSQL

```bash
# Create Neon database at https://neon.tech
# Get connection string and add to Vercel env vars
```

## Step 2: Set up Upstash Redis

```bash
# Create Upstash Redis at https://upstash.com
# Get connection URL and add to Vercel env vars
```

## Step 3: Set up Resend Email

```bash
# Create Resend account at https://resend.com
# Get API key and add to Vercel env vars
# Verify domain for FROM_EMAIL
```

## Step 4: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

## Step 5: Run Database Migrations

```bash
# SSH into Vercel or run locally with production DB URL
export DATABASE_URL="<production-url>"
npm run db:migrate
```

## Step 6: Verify Deployment

- [ ] Visit production URL
- [ ] Test ride creation
- [ ] Test browsing rides
- [ ] Test real-time tracking
- [ ] Test email subscriptions
- [ ] Verify WebSocket connection
- [ ] Check error monitoring (Sentry)

---

# Validation Checklist

After completing implementation, verify:

## Backend
- [ ] All API endpoints respond correctly
- [ ] Database schema created successfully
- [ ] All repositories tested
- [ ] WebSocket connections work
- [ ] Email sending functional
- [ ] Background jobs run on schedule

## Frontend
- [ ] All pages render without errors
- [ ] Navigation works correctly
- [ ] Forms validate properly
- [ ] Map displays markers
- [ ] Real-time updates work
- [ ] Mobile responsive
- [ ] Toast notifications display

## Integration
- [ ] Create ride → Schedule → Track flow works end-to-end
- [ ] Browse → Join → Follow flow works
- [ ] Subscribe → Receive email works
- [ ] Demand submission → Heatmap display works

## Performance
- [ ] API responses < 200ms
- [ ] Page load < 3 seconds
- [ ] WebSocket latency < 2 seconds
- [ ] Map renders smoothly

## Security
- [ ] All inputs validated
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] HTTPS enforced
- [ ] Rate limiting active

---

# Common Issues & Solutions

## Issue: Database connection fails
**Solution**: Check DATABASE_URL is correct and Neon database is running

## Issue: WebSocket won't connect
**Solution**: Ensure Socket.io server is running on correct port and CORS is configured

## Issue: Emails not sending
**Solution**: Verify RESEND_API_KEY and FROM_EMAIL domain is verified

## Issue: Map doesn't display
**Solution**: Check PUBLIC_MAPBOX_TOKEN is set correctly

## Issue: TypeScript errors
**Solution**: Run `npm run check` to validate all types

---

**Implementation Complete!**

This guide provides a complete, systematic approach to rebuilding the Bike Train Tracker from scratch. Follow each part sequentially, validate at checkpoints, and refer to common issues if problems arise.
