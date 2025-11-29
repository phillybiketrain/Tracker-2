/**
 * Geographic utility functions
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in miles
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate total route distance from an array of waypoints
 * @param {Array<{lat: number, lng: number}>} waypoints - Array of waypoint objects
 * @returns {number} Total distance in miles, rounded to 1 decimal place
 */
export function calculateRouteDistance(waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return 0;
  }

  let totalDistance = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    totalDistance += haversineDistance(
      from.lat, from.lng,
      to.lat, to.lng
    );
  }

  // Round to 1 decimal place
  return Math.round(totalDistance * 10) / 10;
}
