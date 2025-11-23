<script>
  import { onMount, onDestroy } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { MAPBOX_TOKEN } from '$lib/config.js';

  export let center = [-75.1652, 39.9526]; // Philadelphia
  export let zoom = 12;
  export let waypoints = [];
  export let onMapClick = null;
  export let onMarkerClick = null;
  export let showRoute = true;
  export let showMarkers = true; // Control whether to show waypoint markers
  export let leaderLocation = null;
  export let autoCenter = false;

  let mapContainer;
  let map;
  let markers = [];
  let routeLine = null;
  let userInteracting = false;
  let interactionTimeout = null;

  onMount(() => {
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'pk.YOUR_MAPBOX_TOKEN_HERE') {
      console.error('⚠️ Missing Mapbox token! Add PUBLIC_MAPBOX_TOKEN to app/.env file');
      console.error('Get a free token at: https://account.mapbox.com/access-tokens/');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: center,
      zoom: zoom
    });

    // Resize map when loaded to ensure proper dimensions
    map.on('load', () => {
      map.resize();
    });

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add geolocate control
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true,
        showUserHeading: true
      }),
      'top-right'
    );

    // Handle map clicks
    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
    }

    // Track user interaction for auto-centering
    if (autoCenter) {
      const handleInteractionStart = () => {
        userInteracting = true;
        if (interactionTimeout) {
          clearTimeout(interactionTimeout);
        }
      };

      const handleInteractionEnd = () => {
        if (interactionTimeout) {
          clearTimeout(interactionTimeout);
        }
        // Wait 3 seconds after interaction stops to resume auto-centering
        interactionTimeout = setTimeout(() => {
          userInteracting = false;
        }, 3000);
      };

      map.on('dragstart', handleInteractionStart);
      map.on('dragend', handleInteractionEnd);
      map.on('touchstart', handleInteractionStart);
      map.on('touchend', handleInteractionEnd);
    }
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  // Smooth path using Catmull-Rom splines with reduced smoothing
  function smoothPath(points) {
    if (points.length < 3) return points;

    const smoothed = [];
    const segments = 3; // Reduced from 10 to 3 for subtler smoothing

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let t = 0; t < segments; t++) {
        const tNorm = t / segments;
        const tSquared = tNorm * tNorm;
        const tCubed = tSquared * tNorm;

        // Catmull-Rom spline formula
        const lng = 0.5 * (
          (2 * p1.lng) +
          (-p0.lng + p2.lng) * tNorm +
          (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * tSquared +
          (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * tCubed
        );

        const lat = 0.5 * (
          (2 * p1.lat) +
          (-p0.lat + p2.lat) * tNorm +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * tSquared +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * tCubed
        );

        smoothed.push({ lng, lat });
      }
    }

    // Add the final point
    smoothed.push(points[points.length - 1]);

    return smoothed;
  }

  // Update waypoints markers
  $: if (map && waypoints) {
    // Clear existing markers
    markers.forEach(m => m.remove());
    markers = [];

    // Add new markers only if showMarkers is true
    if (showMarkers) {
      waypoints.forEach((wp, index) => {
        const el = document.createElement('div');
        el.className = 'waypoint-marker';
        el.style.cursor = onMarkerClick ? 'pointer' : 'default';
        el.innerHTML = `<div class="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg transition-transform hover:scale-110">${index + 1}</div>`;

        // Make marker clickable if callback provided
        if (onMarkerClick) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onMarkerClick(index);
          });
        }

        const marker = new mapboxgl.Marker(el)
          .setLngLat([wp.lng, wp.lat])
          .addTo(map);

        markers.push(marker);
      });
    }

    // Draw route line
    if (showRoute && waypoints.length >= 2) {
      const updateRoute = () => {
        // Use smoothed path if markers are hidden (completed routes)
        const pathPoints = !showMarkers && waypoints.length >= 3
          ? smoothPath(waypoints)
          : waypoints;

        const routeData = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: pathPoints.map(wp => [wp.lng, wp.lat])
          }
        };

        if (map.getSource('route')) {
          map.getSource('route').setData(routeData);
        } else {
          map.addSource('route', {
            type: 'geojson',
            data: routeData
          });

          map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            paint: {
              'line-color': '#E85D04',
              'line-width': 4,
              'line-opacity': 0.9,
              'line-cap': 'round',
              'line-join': 'round'
            }
          });
        }
      };

      if (map.loaded()) {
        updateRoute();
      } else {
        map.once('load', updateRoute);
      }
    } else if (map && map.getSource('route')) {
      // Remove route if less than 2 waypoints
      if (map.getLayer('route')) {
        map.removeLayer('route');
      }
      map.removeSource('route');
    }
  }

  // Update leader location marker
  $: if (map && leaderLocation) {
    const el = document.createElement('div');
    el.innerHTML = '<div class="bg-green-500 rounded-full w-6 h-6 animate-pulse"></div>';

    if (window.leaderMarker) {
      window.leaderMarker.setLngLat([leaderLocation.lng, leaderLocation.lat]);
    } else {
      window.leaderMarker = new mapboxgl.Marker(el)
        .setLngLat([leaderLocation.lng, leaderLocation.lat])
        .addTo(map);
    }

    // Auto-center on leader if enabled and user not interacting
    if (autoCenter && !userInteracting) {
      map.flyTo({
        center: [leaderLocation.lng, leaderLocation.lat],
        essential: true,
        duration: 1000
      });
    }
  }

  export function centerOnLeader() {
    if (map && leaderLocation) {
      map.flyTo({
        center: [leaderLocation.lng, leaderLocation.lat],
        zoom: 15,
        essential: true
      });
    }
  }
</script>

<div bind:this={mapContainer} class="w-full h-full rounded-lg" />

<style>
  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
</style>
