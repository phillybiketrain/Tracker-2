import gpxParser from 'gpxparser';

/**
 * Parse GPX file content and extract waypoints
 * @param {string} xmlString - Raw GPX XML content
 * @returns {{ waypoints: Array<{lat: number, lng: number}>, error?: string }}
 */
export function parseGpxFile(xmlString) {
  try {
    const gpx = new gpxParser();
    gpx.parse(xmlString);

    const waypoints = [];

    // Extract points from all tracks
    for (const track of gpx.tracks) {
      for (const point of track.points) {
        waypoints.push({
          lat: point.lat,
          lng: point.lon  // GPX uses 'lon', our format uses 'lng'
        });
      }
    }

    // Also check for route points (some GPX files use <rte> instead of <trk>)
    for (const route of gpx.routes) {
      for (const point of route.points) {
        waypoints.push({
          lat: point.lat,
          lng: point.lon
        });
      }
    }

    if (waypoints.length < 2) {
      return { waypoints: [], error: 'GPX file must contain at least 2 track points' };
    }

    return { waypoints };
  } catch (e) {
    return { waypoints: [], error: 'Invalid GPX file format' };
  }
}

/**
 * Validate GPX file before parsing
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateGpxFile(file) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit

  if (!file.name.toLowerCase().endsWith('.gpx')) {
    return { valid: false, error: 'File must have .gpx extension' };
  }

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File too large (max 10MB)' };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
}
