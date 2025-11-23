<script>
  import { onMount, onDestroy } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { MAPBOX_TOKEN } from '$lib/config.js';

  export let waypoints = [];
  export let previewImageUrl = null;

  let mapContainer;
  let map;
  let loaded = false;
  let imageLoaded = false;

  // If static image URL is provided, use that instead of initializing a map
  // This significantly improves performance

  onMount(() => {
    // If we have a static image, we don't need to initialize the map
    if (previewImageUrl) {
      return;
    }

    // Fall back to dynamic map initialization
    if (!waypoints || waypoints.length === 0) return;

    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'pk.YOUR_MAPBOX_TOKEN_HERE') {
      console.error('⚠️ Missing Mapbox token');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Initialize map with muted/desaturated style
    map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/light-v11', // Light, minimal style
      center: [waypoints[0].lng, waypoints[0].lat],
      zoom: 12,
      interactive: false, // Disable all interaction
      attributionControl: false // Hide attribution
    });

    map.on('load', () => {
      // Add route line
      if (waypoints.length >= 2) {
        // Use waypoints directly - no smoothing to avoid curve overshoot
        const routeData = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: waypoints.map(wp => [wp.lng, wp.lat])
          }
        };

        map.addSource('route', {
          type: 'geojson',
          data: routeData
        });

        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': '#E85D04', // Primary orange
            'line-width': 4,
            'line-opacity': 0.9,
            'line-cap': 'round',
            'line-join': 'round'
          }
        });

        // Fit map to show entire route
        const bounds = waypoints.reduce((bounds, wp) => {
          return bounds.extend([wp.lng, wp.lat]);
        }, new mapboxgl.LngLatBounds([waypoints[0].lng, waypoints[0].lat], [waypoints[0].lng, waypoints[0].lat]));

        map.fitBounds(bounds, {
          padding: 20,
          duration: 0
        });
      }

      // Apply desaturation filter
      map.setPaintProperty('water', 'fill-color', '#d4d4d8');
      map.setPaintProperty('landuse', 'fill-opacity', 0.3);

      // Fade in after map is fully loaded
      loaded = true;
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

{#if previewImageUrl}
  <!-- Use static image for better performance -->
  <img
    src={previewImageUrl}
    alt="Route preview"
    class="w-full h-full object-cover map-container"
    class:loaded={imageLoaded}
    on:load={() => imageLoaded = true}
  />
{:else}
  <!-- Fall back to dynamic map -->
  <div bind:this={mapContainer} class="w-full h-full bg-warm-gray-100 map-container" class:loaded />
{/if}

<style>
  .map-container {
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
  }

  .map-container.loaded {
    opacity: 1;
  }

  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
  :global(.mapboxgl-ctrl-attrib) {
    display: none !important;
  }
</style>
