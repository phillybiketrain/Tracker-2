<script>
  import { onMount } from 'svelte';

  export let waypoints = [];

  let mapElement;
  let map;
  let bounds;

  onMount(() => {
    if (!window.google || !waypoints || waypoints.length === 0) return;

    // Initialize map with desaturated style
    map = new google.maps.Map(mapElement, {
      center: { lat: waypoints[0].lat, lng: waypoints[0].lng },
      zoom: 13,
      disableDefaultUI: true, // Remove all controls
      draggable: false,
      zoomControl: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      gestureHandling: 'none',
      styles: [
        {
          // Desaturate everything
          stylers: [
            { saturation: -80 },
            { lightness: 20 }
          ]
        },
        {
          // Make water lighter
          featureType: 'water',
          stylers: [
            { lightness: 40 }
          ]
        },
        {
          // Simplify roads
          featureType: 'road',
          elementType: 'labels',
          stylers: [
            { visibility: 'off' }
          ]
        },
        {
          // Hide POIs
          featureType: 'poi',
          stylers: [
            { visibility: 'off' }
          ]
        }
      ]
    });

    // Draw route path
    if (waypoints.length > 0) {
      bounds = new google.maps.LatLngBounds();

      const path = waypoints.map(wp => {
        const pos = { lat: wp.lat, lng: wp.lng };
        bounds.extend(pos);
        return pos;
      });

      // Draw the route line
      new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#E85D04', // Primary orange color
        strokeOpacity: 1.0,
        strokeWeight: 4,
        map: map
      });

      // Fit bounds with some padding
      map.fitBounds(bounds, {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20
      });
    }
  });
</script>

<div bind:this={mapElement} class="w-full h-full bg-warm-gray-100"></div>
