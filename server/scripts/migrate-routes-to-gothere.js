/**
 * Migrate pre-existing PBT routes to Go There.
 *
 * This is a one-shot script. For each route listed in `ROUTES_TO_MIGRATE`
 * below, it:
 *
 *   1. Creates a Go There ride-series (or one-off ride if recurrence is null)
 *   2. Uploads a GPX built from the route's existing waypoints
 *   3. Publishes the series to Neighborhood Commons
 *   4. Mints the persistent 4-char collaborator code
 *   5. UPDATEs the PBT routes row with the GoThere linkage + recurrence columns
 *
 * The PBT `access_code` is preserved — leaders can keep using
 * phillybiketrain.org/go exactly as before. The new GoThere code is
 * additive; both systems work in parallel during the transition.
 *
 * The script is idempotent: routes that already have a gothere_ride_id
 * or gothere_series_id are skipped. If a GoThere call succeeds but the
 * local UPDATE fails, a best-effort rollback deletes the GoThere record.
 *
 * Usage:
 *   1. Fill in ROUTES_TO_MIGRATE below with your 7 routes' access_codes,
 *      recurrence patterns, and first-occurrence dates.
 *   2. Dry-run first:
 *        node server/scripts/migrate-routes-to-gothere.js --dry-run
 *      This validates the config against the DB and prints what would
 *      happen without hitting GoThere.
 *   3. Execute:
 *        node server/scripts/migrate-routes-to-gothere.js
 *
 * Requires the same .env as the PBT server: DATABASE_URL + GOTHERE_*.
 */

import { query, queryOne, closePool } from '../db/client.js';
import { buildGpxFile } from '../utils/gpx.js';
import { toIsoWithOffset } from '../utils/timezone.js';
import * as gothere from '../services/gothere.js';

const PBT_TIMEZONE = 'America/New_York';

// ─────────────────────────────────────────────────────────────────────────
// EDIT THIS: one entry per pre-existing route you want to migrate.
//
// Fields:
//   accessCode         The existing 4-char PBT access code (stays unchanged).
//   recurrence         'weekly' | 'biweekly' | 'monthly' | null
//                        null means this is a one-off ride, not a series.
//                        For weekly/biweekly, the day-of-week is inferred
//                        from `date`.
//                        For monthly, the day-of-month comes from `date`.
//   date               First-occurrence date (YYYY-MM-DD). For one-offs
//                        this is THE date; for recurring it's the first
//                        occurrence.
//   instanceCount      Optional cap (1–260). Omit / null for ongoing series
//                        — Commons auto-extends on a rolling horizon.
// ─────────────────────────────────────────────────────────────────────────

/** @type {Array<{ accessCode: string, recurrence: 'weekly'|'biweekly'|'monthly'|null, date: string, instanceCount?: number }>} */
const ROUTES_TO_MIGRATE = [
  // Example:
  // { accessCode: 'XMKP', recurrence: 'biweekly', date: '2026-05-07' },
  // { accessCode: 'ABCD', recurrence: 'weekly',   date: '2026-05-06' },
  // { accessCode: 'EFGH', recurrence: null,       date: '2026-06-01' }, // one-off
];

// ─────────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (ROUTES_TO_MIGRATE.length === 0) {
    console.error('❌ ROUTES_TO_MIGRATE is empty. Edit this file to list the routes to migrate.');
    process.exit(1);
  }

  if (!gothere.isConfigured() && !DRY_RUN) {
    console.error('❌ GOTHERE_SERVICE_TOKEN is not set. Add it to .env before running (or use --dry-run).');
    process.exit(1);
  }

  console.log(`\n🚴 Migrating ${ROUTES_TO_MIGRATE.length} route(s) to Go There${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  /** @type {Array<{ accessCode: string, status: string, detail?: string }>} */
  const results = [];

  for (const entry of ROUTES_TO_MIGRATE) {
    const result = await migrateOne(entry);
    results.push(result);
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Migration summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of results) {
    const icon = r.status === 'migrated' ? '✅'
      : r.status === 'skipped' ? '⏭️ '
      : r.status === 'dry-run' ? '🔍'
      : '❌';
    console.log(`${icon} ${r.accessCode.padEnd(6)} ${r.status.padEnd(10)} ${r.detail ?? ''}`);
  }
  console.log('');

  await closePool();
}

/**
 * @param {{ accessCode: string, recurrence: 'weekly'|'biweekly'|'monthly'|null, date: string, instanceCount?: number }} entry
 */
async function migrateOne(entry) {
  const { accessCode, recurrence, date, instanceCount } = entry;

  // Validate config shape
  if (!/^[A-Z0-9]{4}$/.test(accessCode)) {
    return { accessCode, status: 'failed', detail: `accessCode must be 4 chars [A-Z0-9]` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { accessCode, status: 'failed', detail: `date must be YYYY-MM-DD` };
  }
  if (recurrence !== null && !['weekly', 'biweekly', 'monthly'].includes(recurrence)) {
    return { accessCode, status: 'failed', detail: `recurrence must be weekly|biweekly|monthly|null` };
  }

  // Look up route
  const route = await queryOne(
    `SELECT * FROM routes WHERE access_code = $1`,
    [accessCode.toUpperCase()]
  );
  if (!route) {
    return { accessCode, status: 'failed', detail: 'route not found in DB' };
  }

  // Idempotency: skip if already migrated
  if (route.gothere_ride_id || route.gothere_series_id) {
    const kind = route.gothere_ride_id ? 'ride' : 'series';
    return {
      accessCode,
      status: 'skipped',
      detail: `already linked to Go There ${kind} ${route.gothere_ride_id || route.gothere_series_id} (${route.gothere_collaborator_code})`,
    };
  }

  // Waypoints can arrive as an array (pg JSONB auto-parse) or a string.
  const waypoints = Array.isArray(route.waypoints) ? route.waypoints : JSON.parse(route.waypoints);
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { accessCode, status: 'failed', detail: 'route has <2 waypoints' };
  }

  const first = waypoints[0];
  const startLocationName = first.address || route.name;
  const departureTime = route.departure_time.length === 5 ? route.departure_time : route.departure_time.slice(0, 5);

  if (DRY_RUN) {
    const label = recurrence ? `series (${recurrence})` : 'one-off';
    return {
      accessCode,
      status: 'dry-run',
      detail: `would create ${label} "${route.name}" — first date ${date}, departure ${departureTime} ${PBT_TIMEZONE}, ${waypoints.length} waypoints`,
    };
  }

  const gpx = buildGpxFile(waypoints, route.name);

  let gothereRideId = null;
  let gothereSeriesId = null;

  try {
    /** @type {{ slug: string, code: string }} */
    let gtResult;

    if (recurrence) {
      const gtSeries = await gothere.createSeries({
        name: route.name,
        timezone: PBT_TIMEZONE,
        startLocationName,
        startAddress: first.address || undefined,
        startLat: first.lat,
        startLng: first.lng,
        details: route.description || undefined,
        recurrence,
        instanceCount: instanceCount ?? undefined,
        startsOn: date,
        departureTimeLocal: departureTime,
      });
      gothereSeriesId = gtSeries.id;
      await gothere.uploadSeriesRoute(gothereSeriesId, gpx);
      await gothere.publishSeries(gothereSeriesId);
      const gtCode = await gothere.mintSeriesCollaboratorCode(gothereSeriesId);
      gtResult = { slug: gtSeries.publicSlug, code: gtCode.code };

    } else {
      const startsAt = toIsoWithOffset(date, departureTime, PBT_TIMEZONE);
      const gtRide = await gothere.createRide({
        name: route.name,
        startsAt,
        timezone: PBT_TIMEZONE,
        startLocationName,
        startAddress: first.address || undefined,
        startLat: first.lat,
        startLng: first.lng,
        details: route.description || undefined,
      });
      gothereRideId = gtRide.id;
      await gothere.uploadRideRoute(gothereRideId, gpx);
      await gothere.publishRide(gothereRideId);
      const gtCode = await gothere.mintRideCollaboratorCode(gothereRideId);
      gtResult = { slug: gtRide.slug, code: gtCode.code };
    }

    // Update PBT row. access_code stays; everything GoThere-related is new.
    await query(
      `UPDATE routes SET
         date = $1,
         recurrence = $2,
         instance_count = $3,
         gothere_ride_id = $4,
         gothere_series_id = $5,
         gothere_slug = $6,
         gothere_collaborator_code = $7
       WHERE id = $8`,
      [
        date,
        recurrence,
        instanceCount ?? null,
        gothereRideId,
        gothereSeriesId,
        gtResult.slug,
        gtResult.code,
        route.id,
      ]
    );

    const label = recurrence ? `series (${recurrence})` : 'one-off';
    return {
      accessCode,
      status: 'migrated',
      detail: `${label} — Go There code ${gtResult.code}, slug ${gtResult.slug}`,
    };

  } catch (err) {
    // Saga rollback
    if (gothereRideId) {
      try { await gothere.deleteRide(gothereRideId); } catch { /* ignore */ }
    }
    if (gothereSeriesId) {
      try { await gothere.deleteSeries(gothereSeriesId); } catch { /* ignore */ }
    }
    return {
      accessCode,
      status: 'failed',
      detail: `${err?.name === 'GoThereError' ? `${err.code}: ` : ''}${err.message}`,
    };
  }
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err);
  closePool().finally(() => process.exit(1));
});
