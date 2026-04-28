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

  // If already linked, the only work left is to make sure the GoThere code
  // equals the PBT access_code (so leaders have one code across both
  // systems, not two). Re-mint with preferredCode = access_code and let
  // GoThere rotate if needed. If the codes already match, the endpoint
  // returns the existing row unchanged.
  if (route.gothere_ride_id || route.gothere_series_id) {
    if (route.gothere_collaborator_code === route.access_code) {
      return {
        accessCode,
        status: 'skipped',
        detail: `already linked with matching code`,
        gothereCode: route.gothere_collaborator_code,
        gothereSlug: route.gothere_slug,
      };
    }
    if (dryRun) {
      return {
        accessCode,
        status: 'dry-run',
        detail: `would update Go There code from ${route.gothere_collaborator_code} → ${route.access_code}`,
      };
    }
    return retrofitCodeOnly(route);
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
      // Preserve the existing PBT access_code as the GoThere code so leaders
      // have one code across both systems. Falls back to random on older
      // GoThere deployments that don't honor `preferredCode`.
      const gtCode = await gothere.mintSeriesCollaboratorCode(gothereSeriesId, {
        preferredCode: route.access_code,
      });
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
      const gtCode = await gothere.mintRideCollaboratorCode(gothereRideId, {
        preferredCode: route.access_code,
      });
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
 * Retrofit the PBT access_code onto an already-migrated route's Go There
 * record. Called when the GoThere linkage exists but the codes don't match
 * (e.g. migrations that ran before preferredCode support landed).
 *
 * @param {any} route  The row loaded from `routes`.
 * @returns {Promise<MigrateRouteResult>}
 */
async function retrofitCodeOnly(route) {
  try {
    /** @type {{ code: string }} */
    let gtCode;
    if (route.gothere_series_id) {
      gtCode = await gothere.mintSeriesCollaboratorCode(route.gothere_series_id, {
        preferredCode: route.access_code,
      });
    } else {
      gtCode = await gothere.mintRideCollaboratorCode(route.gothere_ride_id, {
        preferredCode: route.access_code,
      });
    }
    await query(
      `UPDATE routes SET gothere_collaborator_code = $1 WHERE id = $2`,
      [gtCode.code, route.id]
    );
    return {
      accessCode: route.access_code,
      status: 'migrated',
      detail: `Go There code updated to match (${gtCode.code})`,
      gothereCode: gtCode.code,
      gothereSlug: route.gothere_slug,
    };
  } catch (err) {
    return {
      accessCode: route.access_code,
      status: 'failed',
      detail: `code update failed: ${err?.message ?? err}`,
      errorCode: err?.name === 'GoThereError' ? err.code : undefined,
    };
  }
}

/**
 * Apply a Go There `/admin/reslug-series` response to our local rows.
 *
 * Go There's series-URL redesign collapsed `/series/<12-char>` to bare
 * `/<6-char>`; their migration re-issued 6-char slugs for every existing
 * series and we have to mirror those into our `routes.gothere_slug`
 * column. Match by `gothere_series_id` (= response.results[].seriesId).
 *
 * @param {{ results: Array<{ seriesId: string, oldSlug?: string, newSlug: string, commonsUpdated?: boolean }> }} payload
 * @returns {Promise<{
 *   updated: number,
 *   results: Array<{
 *     seriesId: string,
 *     oldSlug?: string,
 *     newSlug: string,
 *     accessCode?: string,
 *     name?: string,
 *     status: 'updated' | 'unchanged' | 'no_local_row',
 *   }>
 * }>}
 */
export async function refreshSlugs(payload) {
  if (!payload || !Array.isArray(payload.results)) {
    throw new TypeError('payload.results must be an array');
  }

  const results = [];
  for (const entry of payload.results) {
    const { seriesId, oldSlug, newSlug } = entry || {};

    const before = await queryOne(
      `SELECT access_code, name, gothere_slug FROM routes WHERE gothere_series_id = $1`,
      [seriesId]
    );
    if (!before) {
      // Go There has a series we don't track locally — log and move on.
      results.push({ seriesId, oldSlug, newSlug, status: 'no_local_row' });
      continue;
    }

    if (before.gothere_slug === newSlug) {
      results.push({
        seriesId, oldSlug, newSlug,
        accessCode: before.access_code,
        name: before.name,
        status: 'unchanged',
      });
      continue;
    }

    await query(
      `UPDATE routes SET gothere_slug = $1 WHERE gothere_series_id = $2`,
      [newSlug, seriesId]
    );
    results.push({
      seriesId, oldSlug, newSlug,
      accessCode: before.access_code,
      name: before.name,
      status: 'updated',
    });
  }

  return {
    updated: results.filter((r) => r.status === 'updated').length,
    results,
  };
}

/**
 * List routes that still need work: either not yet linked to Go There, or
 * linked but with a GoThere collaborator code that doesn't match the PBT
 * access_code (so the admin page can offer a one-click retrofit).
 *
 * Each row includes a `linkage_state` discriminator the UI uses to decide
 * whether to prompt for recurrence+date (unmigrated) or show a single
 * "update code" action (code_mismatch).
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   access_code: string,
 *   name: string,
 *   departure_time: string,
 *   waypoints_count: number,
 *   recent_dates: string[],
 *   linkage_state: 'unmigrated' | 'code_mismatch',
 *   gothere_collaborator_code: string | null,
 *   gothere_slug: string | null,
 *   recurrence: string | null,
 *   date: string | null,
 * }>>}
 */
export async function listMigrationCandidates() {
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
      ) AS recent_dates,
      CASE
        WHEN r.gothere_ride_id IS NULL AND r.gothere_series_id IS NULL THEN 'unmigrated'
        ELSE 'code_mismatch'
      END AS linkage_state,
      r.gothere_collaborator_code,
      r.gothere_slug,
      r.recurrence,
      r.date::text AS date
    FROM routes r
    LEFT JOIN ride_instances ri ON ri.route_id = r.id
    WHERE r.status = 'approved'
      AND (
        (r.gothere_ride_id IS NULL AND r.gothere_series_id IS NULL)
        OR r.gothere_collaborator_code IS DISTINCT FROM r.access_code
      )
    GROUP BY r.id
    ORDER BY r.created_at ASC
  `);

  return result.rows;
}

// Backwards-compat alias during the transition — the admin endpoint import
// still points here.
export const listUnmigratedRoutes = listMigrationCandidates;
