/**
 * Server-side GPX utilities.
 *
 * The browser has a counterpart at app/src/lib/utils/gpx.js with richer
 * functionality (parsing uploaded files, triggering downloads). This module
 * intentionally holds only what the backend needs: converting the
 * waypoints array stored on routes into a GPX 1.1 document that can be
 * POSTed to GoThere's route-upload endpoint.
 *
 * Keep `buildGpxFile` byte-identical to the client version so round-trips
 * between the two are lossless.
 */

/**
 * Build a GPX 1.1 XML string from waypoints.
 * @param {Array<{lat: number, lng: number}>} waypoints
 * @param {string} [name='Route']
 * @returns {string}
 */
export function buildGpxFile(waypoints, name = 'Route') {
  const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
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
