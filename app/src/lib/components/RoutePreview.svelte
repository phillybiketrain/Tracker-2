<script>
  import { onMount, onDestroy } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { MAPBOX_TOKEN } from '$lib/config.js';

  export let waypoints = [];

  let mapContainer;
  let map;

  onMount(() => {
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
            'line-opacity': 1.0
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
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div bind:this={mapContainer} class="w-full h-full bg-warm-gray-100" />

<style>
  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
  :global(.mapboxgl-ctrl-attrib) {
    display: none !important;
  }
</style>
