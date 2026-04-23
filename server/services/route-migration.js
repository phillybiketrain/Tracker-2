/**
 * Shared logic for migrating a pre-existing PBT route into Go There.
 *
 * Used by:
 *   - server/scripts/migrate-routes-to-gothere.js (one-shot local script)
 *   - server/routes/admin-migration.js (admin HTTP endpoint — easier when
 *     the Railway Postgres isn't reachable from your laptop)
 *
 * The contract is: given an access_code + recurrence hint + first-occurrence
 * date, create the GoThere ride/series, upload GPX, publish, mint the
 * collaborator code, and update the PBT routes row. Idempotent (skips if
 * already linked). Saga rollback on failure (delete GoThere record).
 *
 * The PBT `access_code` is preserved — the legacy `/go` broadcast path keeps
 * working unchanged after migration. The new gothere_collaborator_code is
 * additive.
 */

import { query, queryOne } from '../db/client.js';
import { buildGpxFile } from '../utils/gpx.js';
import { toIsoWithOffset } from '../utils/timezone.js';
import * as gothere from './gothere.js';

const PBT_TIMEZONE = 'America/New_York';

/**
 * @typedef {object} MigrateRouteInput
 * @property {string} accessCode
 * @property {'weekly'|'biweekly'|'monthly'|null} recurrence
 *   `null` = treat as one-off; otherwise Commons internal recurrence format.
 * @property {string} date           YYYY-MM-DD, first-occurrence (or the
 *                                   single date, for one-offs)
 * @property {number} [instanceCount] Optional cap for bounded series
 *
 * @typedef {object} MigrateRouteResult
 * @property {string} accessCode
 * @property {'migrated'|'skipped'|'failed'|'dry-run'} status
 * @property {string} [detail]       Human-readable summary
 * @property {string} [gothereCode]  New GoThere code, when migrated
 * @property {string} [gothereSlug]  New GoThere follower-page slug, when migrated
 * @property {string} [errorCode]    GoThereError.code or similar, when failed
 */

/**
 * Migrate one route. Pure function in / pure result out — no process.exit,
 * no console.log side effects, so the HTTP endpoint can return this as JSON.
 *
 * @param {MigrateRouteInput} entry
 * @param {object} [options]
 * @param {boolean} [options.dryRun]  Validate only; do not touch GoThere
 *                                    or UPDATE the local row.
 * @returns {Promise<MigrateRouteResult>}
 */
export async function migrateRoute(entry, { dryRun = false } = {}) {
  const { accessCode, recurrence, date, instanceCount } = entry;

  // Validate config shape
  if (!/^[A-Z0-9]{4}$/.test(accessCode)) {
    return { accessCode, status: 'failed', detail: 'accessCode must be 4 chars [A-Z0-9]' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { accessCode, status: 'failed', detail: 'date must be YYYY-MM-DD' };
  }
  if (recurrence !== null && !['weekly', 'biweekly', 'monthly'].includes(recurrence)) {
    return { accessCode, status: 'failed', detail: 'recurrence must be weekly|biweekly|monthly|null' };
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
      detail: `already linked to Go There ${kind} (${route.gothere_collaborator_code})`,
      gothereCode: route.gothere_collaborator_code,
      gothereSlug: route.gothere_slug,
    };
  }

  // Waypoints can arrive parsed (JSONB) or stringified
  const waypoints = Array.isArray(route.waypoints) ? route.waypoints : JSON.parse(route.waypoints);
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { accessCode, status: 'failed', detail: 'route has <2 waypoints' };
  }

  const first = waypoints[0];
  const startLocationName = first.address || route.name;
  const departureTime = route.departure_time.length === 5 ? route.departure_time : route.departure_time.slice(0, 5);

  if (dryRun) {
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
      gothereCode: gtResult.code,
      gothereSlug: gtResult.slug,
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
      detail: err?.message ?? String(err),
      errorCode: err?.name === 'GoThereError' ? err.code : undefined,
    };
  }
}

/**
 * List routes that haven't been migrated yet — used by the admin page to
 * show a populated table without making the user re-type access codes.
 *
 * @returns {Promise<Array<{ id: string, access_code: string, name: string, departure_time: string, waypoints_count: number, recent_dates: string[] }>>}
 */
export async function listUnmigratedRoutes() {
  const rows = await queryOne(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routes' AND column_name = 'gothere_ride_id'
  `);
  if (!rows) {
    // Column doesn't exist yet — migration 012 hasn't run
    throw new Error('Schema not up to date: run `npm run db:migrate` to add GoThere columns first.');
  }

  const result = await query(`
    SELECT
      r.id,
      r.access_code,
      r.name,
      r.departure_time::text AS departure_time,
      jsonb_array_length(r.waypoints) AS waypoints_count,
      COALESCE(
        ARRAY_AGG(ri.date::text ORDER BY ri.date DESC)
          FILTER (WHERE ri.date IS NOT NULL AND ri.date >= CURRENT_DATE - INTERVAL '90 days'),
        ARRAY[]::text[]
      ) AS recent_dates
    FROM routes r
    LEFT JOIN ride_instances ri ON ri.route_id = r.id
    WHERE r.gothere_ride_id IS NULL
      AND r.gothere_series_id IS NULL
      AND r.status = 'approved'
    GROUP BY r.id
    ORDER BY r.created_at ASC
  `);

  return result.rows;
}
