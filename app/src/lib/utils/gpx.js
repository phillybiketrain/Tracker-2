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
 * Build a GPX 1.1 XML string from waypoints.
 * @param {Array<{lat: number, lng: number}>} waypoints
 * @param {string} [name]
 * @returns {string}
 */
export function buildGpxFile(waypoints, name = 'Route') {
  const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
  const pts = waypoints
    .map((p) => `      <trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Philly Bike Train" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/**
 * Trigger a browser download of waypoints as a .gpx file.
 * @param {Array<{lat: number, lng: number}>} waypoints
 * @param {string} name
 */
export function downloadGpx(waypoints, name = 'route') {
  const xml = buildGpxFile(waypoints, name);
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'route';
  a.href = url;
  a.download = `${safe}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
