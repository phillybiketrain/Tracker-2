/**
 * Mapbox utilities for static image generation
 */

/**
 * Sample waypoints to reduce path length for URL limits
 * @param {Array} waypoints - Full waypoints array
 * @param {number} maxPoints - Maximum number of points to keep
 * @returns {Array} Sampled waypoints including first and last
 */
function sampleWaypoints(waypoints, maxPoints = 100) {
  if (waypoints.length <= maxPoints) {
    return waypoints;
  }

  const sampled = [];
  const step = (waypoints.length - 1) / (maxPoints - 1);

  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(waypoints[Math.round(i * step)]);
  }
  // Always include the last point
  sampled.push(waypoints[waypoints.length - 1]);

  return sampled;
}

/**
 * Generate a Mapbox Static Images API URL for a route preview
 * @param {Array} waypoints - Array of {lat, lng} waypoints
 * @param {Object} options - Optional configuration
 * @returns {string} Static image URL
 */
export function generateRoutePreviewUrl(waypoints, options = {}) {
  const {
    width = 400,
    height = 200,
    retina = true,
    style = 'light-v11',
    lineColor = 'e85d04', // Primary orange (no # prefix)
    lineWidth = 3,
    lineOpacity = 1.0
  } = options;

  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

  if (!MAPBOX_TOKEN || !waypoints || waypoints.length < 2) {
    return null;
  }

  // Sample waypoints for large routes to keep URL under limits
  // Mapbox Static API has ~8KB URL limit, each coord is ~20 chars
  const sampledWaypoints = sampleWaypoints(waypoints, 100);

  // Convert waypoints to path overlay format: lng,lat|lng,lat|...
  const pathCoords = sampledWaypoints
    .map(wp => `${wp.lng},${wp.lat}`)
    .join(',');

  // Create path overlay with styling
  // Format: path-{width}+{color}-{opacity}({coordinates})
  const pathOverlay = `path-${lineWidth}+${lineColor}-${lineOpacity}(${pathCoords})`;

  // Use 'auto' to automatically fit bounds to the path
  const position = 'auto';

  // Construct URL
  const retinaParam = retina ? '@2x' : '';
  const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${encodeURIComponent(pathOverlay)}/${position}/${width}x${height}${retinaParam}?access_token=${MAPBOX_TOKEN}`;

  return url;
}

/**
 * Generate a preview URL with padding around the route
 * @param {Array} waypoints - Array of {lat, lng} waypoints
 * @returns {string} Static image URL
 */
export function generateRoutePreviewUrlWithPadding(waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return null;
  }

  // Calculate bounding box from ALL waypoints (for accurate bounds)
  const lngs = waypoints.map(wp => wp.lng);
  const lats = waypoints.map(wp => wp.lat);

  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // Add 10% padding
  const lngPadding = (maxLng - minLng) * 0.1;
  const latPadding = (maxLat - minLat) * 0.1;

  const bbox = [
    minLng - lngPadding,
    minLat - latPadding,
    maxLng + lngPadding,
    maxLat + latPadding
  ].join(',');

  // Sample waypoints for the path overlay
  const sampledWaypoints = sampleWaypoints(waypoints, 100);
  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
  const pathCoords = sampledWaypoints.map(wp => `${wp.lng},${wp.lat}`).join(',');
  const pathOverlay = `path-3+e85d04-1.0(${pathCoords})`;

  const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${encodeURIComponent(pathOverlay)}/[${bbox}]/400x200@2x?access_token=${MAPBOX_TOKEN}`;

  return url;
}
