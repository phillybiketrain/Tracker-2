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
  export let showStartIconOnly = false; // Show only start location icon (not numbered waypoints)
  export let showAllMarkers = true; // When false with many waypoints, only show start/end markers
  export let startLocationIconUrl = null; // Custom icon for start location
  export let leaderLocation = null;
  export let autoCenter = false;
  export let locationTrail = []; // Array of {lat, lng, timestamp} for leader's trail

  // Multi-ride mode: array of {accessCode, waypoints, leaderLocation, locationTrail, routeName}
  export let rides = [];

  // Colors for multi-ride mode
  const RIDE_COLORS = [
    '#E85D04', // Orange
    '#3b82f6', // Blue
    '#10b981', // Green
    '#8b5cf6', // Purple
    '#ef4444', // Red
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#06b6d4', // Cyan
  ];

  // Maximum points for route line rendering (prevents browser crashes with large GPX files)
  const MAX_ROUTE_POINTS = 500;

  /**
   * Sample waypoints to reduce rendering load while maintaining route shape
   * @param {Array} points - Full waypoints array
   * @param {number} maxPoints - Maximum number of points to keep
   * @returns {Array} Sampled waypoints including first and last
   */
  function sampleWaypoints(points, maxPoints = MAX_ROUTE_POINTS) {
    if (!points || points.length <= maxPoints) {
      return points;
    }

    const sampled = [];
    const step = (points.length - 1) / (maxPoints - 1);

    for (let i = 0; i < maxPoints - 1; i++) {
      sampled.push(points[Math.round(i * step)]);
    }
    // Always include the last point
    sampled.push(points[points.length - 1]);

    return sampled;
  }

  let mapContainer;
  let map;
  let markers = [];
  let routeLine = null;
  let userInteracting = false;
  let interactionTimeout = null;
  let multiRideMarkers = {}; // Store markers by accessCode

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
        }, 2000); // 2 seconds before re-centering
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

  // Update waypoints markers
  $: if (map && waypoints) {
    // Clear existing markers
    markers.forEach(m => m.remove());
    markers = [];

    // Add new markers
    if (showMarkers || showStartIconOnly) {
      waypoints.forEach((wp, index) => {
        // If showStartIconOnly, only show the first waypoint with custom icon
        if (showStartIconOnly && index !== 0) return;

        // For large routes (GPX imports), only show start and end markers
        const isFirstOrLast = index === 0 || index === waypoints.length - 1;
        if (!showAllMarkers && !isFirstOrLast) return;

        const el = document.createElement('div');
        el.className = 'waypoint-marker';
        el.style.cursor = onMarkerClick ? 'pointer' : 'default';

        // Use custom icon for start location (first waypoint) if provided
        if (index === 0 && startLocationIconUrl) {
          el.innerHTML = `<img src="${startLocationIconUrl}" alt="Start location" class="w-10 h-10 object-contain rounded-lg shadow-lg" style="transition: transform 0.2s;">`;
          el.onmouseenter = () => { el.querySelector('img').style.transform = 'scale(1.1)'; };
          el.onmouseleave = () => { el.querySelector('img').style.transform = 'scale(1)'; };
        } else if (showMarkers) {
          // Only show numbered markers when showMarkers is true (not just showStartIconOnly)
          el.innerHTML = `<div class="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg transition-transform hover:scale-110">${index + 1}</div>`;
        } else {
          // Skip this waypoint if we're only showing start icon
          return;
        }

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
        // Sample waypoints for large routes to prevent browser crashes
        const displayWaypoints = sampleWaypoints(waypoints);
        const routeData = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: displayWaypoints.map(wp => [wp.lng, wp.lat])
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
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#E85D04',
              'line-width': 4,
              'line-opacity': 0.9
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

    // Fit map to show all waypoints
    if (waypoints.length > 0 && !onMapClick) {
      // Only auto-fit if not in create/edit mode (onMapClick is used for creating routes)
      const bounds = new mapboxgl.LngLatBounds();
      waypoints.forEach(wp => {
        bounds.extend([wp.lng, wp.lat]);
      });

      // Wait for map to be loaded before fitting bounds
      const fitBounds = () => {
        map.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 15,
          duration: 1000
        });
      };

      if (map.loaded()) {
        fitBounds();
      } else {
        map.once('load', fitBounds);
      }
    }
  }

  // Update location trail
  $: if (map && locationTrail && locationTrail.length > 1) {
    const updateTrail = () => {
      // Sample trail if very long (for performance)
      const displayTrail = sampleWaypoints(locationTrail, MAX_ROUTE_POINTS);
      const trailCoords = displayTrail.map(point => [point.lng, point.lat]);

      if (map.getSource('location-trail')) {
        map.getSource('location-trail').setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: trailCoords
          }
        });
      } else {
        map.addSource('location-trail', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: trailCoords
            }
          }
        });

        map.addLayer({
          id: 'location-trail',
          type: 'line',
          source: 'location-trail',
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['line-progress'],
              0, '#10b981',  // Start: green
              0.5, '#3b82f6', // Middle: blue
              1, '#8b5cf6'   // End: purple (most recent)
            ],
            'line-width': 4,
            'line-opacity': 0.8
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        }, 'route'); // Place below route layer
      }
    };

    if (map.loaded()) {
      updateTrail();
    } else {
      map.once('load', updateTrail);
    }
  }

  // Update leader location marker with custom image
  $: if (map && leaderLocation) {
    const el = document.createElement('div');
    el.className = 'leader-marker';
    el.innerHTML = '<img src="/leader-marker.png" alt="Leader" style="width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">';

    if (window.leaderMarker) {
      window.leaderMarker.setLngLat([leaderLocation.lng, leaderLocation.lat]);
    } else {
      window.leaderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
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

  // Multi-ride mode rendering
  $: if (map && rides && rides.length > 0) {
    const updateMultiRides = () => {
      // Clear existing multi-ride markers
      Object.values(multiRideMarkers).forEach(marker => marker.remove());
      multiRideMarkers = {};

      const bounds = new mapboxgl.LngLatBounds();

      rides.forEach((ride, index) => {
        const color = RIDE_COLORS[index % RIDE_COLORS.length];
        const routeId = `route-${ride.accessCode}`;
        const trailId = `trail-${ride.accessCode}`;

        // Draw planned route (dashed line)
        if (ride.waypoints && ride.waypoints.length >= 2) {
          // Sample waypoints for large routes
          const displayWaypoints = sampleWaypoints(ride.waypoints);
          const routeData = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: displayWaypoints.map(wp => [wp.lng, wp.lat])
            }
          };

          if (map.getSource(routeId)) {
            map.getSource(routeId).setData(routeData);
          } else {
            map.addSource(routeId, {
              type: 'geojson',
              data: routeData
            });

            map.addLayer({
              id: routeId,
              type: 'line',
              source: routeId,
              layout: {
                'line-cap': 'round',
                'line-join': 'round'
              },
              paint: {
                'line-color': color,
                'line-width': 3,
                'line-opacity': 0.4,
                'line-dasharray': [2, 2] // Dashed line for planned route
              }
            });
          }

          // Add waypoints to bounds
          ride.waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));
        }

        // Draw traveled path (solid gradient line)
        if (ride.locationTrail && ride.locationTrail.length >= 2) {
          // Sample trail for large routes
          const displayTrail = sampleWaypoints(ride.locationTrail, MAX_ROUTE_POINTS);
          const trailCoords = displayTrail.map(point => [point.lng, point.lat]);
          const trailData = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: trailCoords
            }
          };

          if (map.getSource(trailId)) {
            map.getSource(trailId).setData(trailData);
          } else {
            map.addSource(trailId, {
              type: 'geojson',
              data: trailData,
              lineMetrics: true // Enable line-progress for gradient
            });

            map.addLayer({
              id: trailId,
              type: 'line',
              source: trailId,
              layout: {
                'line-cap': 'round',
                'line-join': 'round'
              },
              paint: {
                'line-color': [
                  'interpolate',
                  ['linear'],
                  ['line-progress'],
                  0, '#10b981',  // Start: green
                  0.5, '#3b82f6', // Middle: blue
                  1, '#8b5cf6'   // End: purple (most recent)
                ],
                'line-width': 4,
                'line-opacity': 0.9
              }
            });
          }

          // Add trail points to bounds
          ride.locationTrail.forEach(point => bounds.extend([point.lng, point.lat]));
        }

        // Draw leader marker
        if (ride.leaderLocation) {
          const el = document.createElement('div');
          el.className = 'leader-marker-multi';
          el.style.cssText = `
            position: relative;
            cursor: pointer;
          `;
          el.innerHTML = '<img src="/leader-marker.png" alt="Leader" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">';
          el.title = ride.routeName || ride.accessCode;

          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([ride.leaderLocation.lng, ride.leaderLocation.lat])
            .addTo(map);

          multiRideMarkers[ride.accessCode] = marker;
          bounds.extend([ride.leaderLocation.lng, ride.leaderLocation.lat]);
        }
      });

      // Fit map to show all rides
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 60, right: 60 },
          maxZoom: 14,
          duration: 1000
        });
      }
    };

    if (map.loaded()) {
      updateMultiRides();
    } else {
      map.once('load', updateMultiRides);
    }
  }

  // Update a single ride's leader location (for real-time updates)
  export function updateRideLeader(accessCode, location) {
    if (multiRideMarkers[accessCode]) {
      multiRideMarkers[accessCode].setLngLat([location.lng, location.lat]);
    }
  }

  // Fit bounds to show all rides
  export function fitAllRides() {
    if (!map || rides.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    rides.forEach(ride => {
      if (ride.waypoints) {
        ride.waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));
      }
      if (ride.leaderLocation) {
        bounds.extend([ride.leaderLocation.lng, ride.leaderLocation.lat]);
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 14,
        duration: 1000
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
