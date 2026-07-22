/**
 * Routes API
 * Handles creating routes (one-off rides) and — legacy — scheduling instances.
 *
 * As of Batch 2 of the GoThere integration, every route creation also
 * provisions a matching GoThere ride (owned by the philly-bike-train account),
 * publishes it to Neighborhood Commons, and mints the persistent 4-char
 * collaborator code that the ride leader will redeem in the GoThere app.
 *
 * The legacy `access_code` and `ride_instances` rows are still created so
 * the existing broadcast/manage UIs keep working; they'll be retired in a
 * later batch once the handoff is complete.
 */

import express from 'express';
import { query, queryOne, queryAll } from '../db/client.js';
import { z } from 'zod';
import { generateRoutePreviewUrl } from '../utils/mapbox.js';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../utils/upload.js';
import { calculateRouteDistance } from '../utils/geo.js';
import { buildGpxFile } from '../utils/gpx.js';
import { toIsoWithOffset } from '../utils/timezone.js';
import { nextOccurrence, humanizeRecurrence } from '../utils/recurrence.js';
import * as gothere from '../services/gothere.js';

const router = express.Router();

// PBT is Philadelphia-only for now; when regions gain their own timezones
// this moves to the `regions` table.
const PBT_TIMEZONE = 'America/New_York';

// Commons' internal recurrence format (shared with GoThere). Kept verbatim
// — no RRULE translation layer. Matches the CHECK constraint in
// migrations/013_ride_series.sql.
const RECURRENCE_REGEX = /^(daily|weekly|biweekly|monthly|ordinal_weekday:[1-5]:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly_days:(mon|tue|wed|thu|fri|sat|sun)(,(mon|tue|wed|thu|fri|sat|sun))*)$/;

// Validation schemas
const CreateRouteSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2500).optional(),
  waypoints: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().optional()
  })).min(2),
  departure_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  // YYYY-MM-DD, interpreted in PBT_TIMEZONE. For one-off rides this is the
  // date of the ride; for recurring, it's the first-occurrence date.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // When set, the route is recurring and goes through GoThere's ride-series
  // endpoints. When omitted, it's a one-off ride.
  recurrence: z.string().regex(RECURRENCE_REGEX).optional(),
  // Cap for bounded series; omit for ongoing (Commons auto-extends on a
  // rolling horizon).
  instance_count: z.number().int().min(1).max(260).optional(),
  creator_email: z.string().email().optional(),
  tag: z.enum(['community', 'regular', 'special']).optional(),
  region: z.string().optional() // Region slug (defaults to 'philly')
});

const ScheduleRideSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1)
});

/**
 * POST /api/routes
 * Create a route and publish it through GoThere → Commons.
 *
 * Branches on `recurrence`:
 *   - omitted  → one-off ride   → POST /rides on GoThere
 *   - present  → recurring ride → POST /ride-series on GoThere (Commons
 *                                 materializes N instances automatically)
 *
 * Saga on failure: if any GoThere call throws after the ride/series has
 * been created, we attempt a best-effort delete so orphans don't pile up.
 */
router.post('/', async (req, res) => {
  let gothereRideId = null;    // set only in the one-off branch; used for rollback
  let gothereSeriesId = null;  // set only in the recurring branch; used for rollback

  try {
    const data = CreateRouteSchema.parse(req.body);

    // Resolve region
    const regionSlug = data.region || 'philly';
    const region = await queryOne(
      `SELECT id FROM regions WHERE slug = $1`,
      [regionSlug]
    );
    if (!region) {
      return res.status(400).json({
        error: 'Invalid region',
        message: `Region '${regionSlug}' does not exist`
      });
    }

    // ── Shared ride content ─────────────────────────────────────────────
    const first = data.waypoints[0];
    const startLocationName = first.address || data.name;
    const gpx = buildGpxFile(data.waypoints, data.name);

    // Minted before the GoThere saga so we can hand it to GoThere as the
    // preferred collaborator code. A route must have exactly one code:
    // what the admin dashboard prints is what the Go There app accepts.
    // Letting GoThere mint its own would silently create a second code.
    const accessCode = await queryOne('SELECT generate_access_code() as code');

    // Common shape of what we need back from GoThere, regardless of branch.
    /** @type {{ slug: string, code: string }} */
    let gtResult;

    // ── GoThere saga ────────────────────────────────────────────────────
    if (data.recurrence) {
      // Recurring: one GoThere ride-series → Commons materializes instances.
      const gtSeries = await gothere.createSeries({
        name: data.name,
        timezone: PBT_TIMEZONE,
        startLocationName,
        startAddress: first.address || undefined,
        startLat: first.lat,
        startLng: first.lng,
        details: data.description || undefined,
        recurrence: data.recurrence,
        instanceCount: data.instance_count ?? undefined,
        startsOn: data.date,
        departureTimeLocal: data.departure_time,
      });
      gothereSeriesId = gtSeries.id;

      await gothere.uploadSeriesRoute(gothereSeriesId, gpx);
      await gothere.publishSeries(gothereSeriesId);
      const gtCode = await gothere.mintSeriesCollaboratorCode(gothereSeriesId, {
        preferredCode: accessCode.code,
      });
      gtResult = { slug: gtSeries.publicSlug, code: gtCode.code };

    } else {
      // One-off: a single GoThere ride, one Commons event, per-occurrence code.
      const startsAt = toIsoWithOffset(data.date, data.departure_time, PBT_TIMEZONE);

      const gtRide = await gothere.createRide({
        name: data.name,
        startsAt,
        timezone: PBT_TIMEZONE,
        startLocationName,
        startAddress: first.address || undefined,
        startLat: first.lat,
        startLng: first.lng,
        details: data.description || undefined,
      });
      gothereRideId = gtRide.id;

      await gothere.uploadRideRoute(gothereRideId, gpx);
      await gothere.publishRide(gothereRideId);
      const gtCode = await gothere.mintRideCollaboratorCode(gothereRideId, {
        preferredCode: accessCode.code,
      });
      gtResult = { slug: gtRide.slug, code: gtCode.code };
    }

    // ── Local state ─────────────────────────────────────────────────────
    // access_code is still used by the existing broadcast/manage UIs, and is
    // now also the Go There collaborator code (pinned above).
    const previewImageUrl = generateRoutePreviewUrl(data.waypoints);
    const distanceMiles = calculateRouteDistance(data.waypoints);

    const route = await queryOne(`
      INSERT INTO routes (
        access_code, name, description, waypoints,
        departure_time, creator_email,
        status, tag, region_id, preview_image_url, distance_miles,
        date, recurrence, instance_count,
        gothere_ride_id, gothere_series_id, gothere_slug, gothere_collaborator_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      accessCode.code,
      data.name,
      data.description || null,
      JSON.stringify(data.waypoints),
      data.departure_time,
      data.creator_email || null,
      'approved',
      data.tag || 'community',
      region.id,
      previewImageUrl,
      distanceMiles,
      data.date,
      data.recurrence || null,
      data.instance_count ?? null,
      gothereRideId,
      gothereSeriesId,
      gtResult.slug,
      gtResult.code,
    ]);

    // Legacy ride_instances mirror for the existing /[slug] "next ride" lookup.
    // Only for one-offs; for recurring series, Commons is authoritative on
    // instance dates and PBT doesn't need its own copy. Retired in Batch 6.
    if (!data.recurrence) {
      await query(`
        INSERT INTO ride_instances (route_id, date, status, region_id)
        VALUES ($1, $2, 'scheduled', $3)
        ON CONFLICT (route_id, date) DO NOTHING
      `, [route.id, data.date, region.id]);
    }

    const label = data.recurrence ? `series (${data.recurrence})` : 'one-off';
    console.log(
      `✅ Route created ${label}: ${route.name} — PBT ${route.access_code} / GoThere ${gtResult.code} @ ${gtResult.slug}`
    );

    res.status(201).json({ success: true, data: route });

  } catch (error) {
    // Saga rollback: only one of these is set at a time (exclusive branch above).
    if (gothereRideId) {
      try {
        await gothere.deleteRide(gothereRideId);
        console.warn(`🗑️  Rolled back GoThere ride ${gothereRideId}`);
      } catch (rollbackErr) {
        console.error(`⚠️  Failed to rollback GoThere ride ${gothereRideId}:`, rollbackErr.message);
      }
    }
    if (gothereSeriesId) {
      try {
        await gothere.deleteSeries(gothereSeriesId);
        console.warn(`🗑️  Rolled back GoThere series ${gothereSeriesId}`);
      } catch (rollbackErr) {
        console.error(`⚠️  Failed to rollback GoThere series ${gothereSeriesId}:`, rollbackErr.message);
      }
    }

    if (error instanceof z.ZodError) {
      console.error('❌ Validation error creating route:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error?.name === 'GoThereError') {
      console.error(`❌ GoThere error (${error.code}): ${error.message}`);
      return res.status(502).json({
        error: 'Upstream failure',
        message: 'Could not publish to Go There',
        code: error.code,
      });
    }

    console.error('❌ Error creating route:', error);
    res.status(500).json({ error: 'Failed to create route', message: error.message });
  }
});

/**
 * GET /api/routes/by-slug/:slug
 * Return a route by vanity slug, along with the next occurrence.
 *
 * "Next occurrence" is resolved in priority order:
 *
 *   1. A currently-live ride_instance (legacy socket.io broadcast path) —
 *      this is authoritative because a leader is actively sending GPS.
 *   2. If the route has `recurrence` + `date` populated (post-migration
 *      routes), compute the next occurrence from the recurrence pattern.
 *      No ride_instance row needs to exist — the schedule is derived.
 *   3. Fall back to the legacy ride_instances lookup for pre-migration
 *      routes that only have ad-hoc scheduled dates.
 *
 * `other_rides` keeps its legacy meaning (next few pre-scheduled dates)
 * because the homepage + slug pages still render it. For recurring
 * routes it now seeds a synthetic list of upcoming occurrences so the
 * "next few" still shows something sensible.
 */
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const route = await queryOne(`
      SELECT * FROM routes WHERE slug = $1
    `, [slug.toLowerCase()]);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // (1) Any live ride_instance takes precedence — someone is broadcasting now.
    const liveInstance = await queryOne(`
      SELECT * FROM ride_instances
      WHERE route_id = $1 AND status = 'live'
      LIMIT 1
    `, [route.id]);

    let nextRide = null;
    let otherRides = [];

    if (liveInstance) {
      nextRide = liveInstance;
      // Keep behaviour symmetric — pull the usual "other upcoming" list too.
      otherRides = await queryAll(`
        SELECT ri.id, ri.date, ri.status
        FROM ride_instances ri
        WHERE ri.route_id = $1
          AND ri.date >= CURRENT_DATE
          AND ri.status IN ('scheduled', 'live')
          AND ri.id != $2
        ORDER BY ri.date ASC
        LIMIT 10
      `, [route.id, liveInstance.id]);

    } else if (route.date) {
      // (2) Derive from recurrence. Also works for one-offs (recurrence=null);
      //     nextOccurrence returns the single date if it's in the future, null
      //     otherwise.
      //
      // Normalize route.date once — the pg driver returns DATE columns as JS
      // Date objects by default, but nextOccurrence / toIsoWithOffset expect
      // a 'YYYY-MM-DD' string.
      const firstDate = typeof route.date === 'string'
        ? route.date
        : route.date.toISOString().slice(0, 10);

      const now = new Date();
      const next = nextOccurrence(now, {
        recurrence: route.recurrence,
        firstDate,
        departureTime: route.departure_time,
        timezone: PBT_TIMEZONE,
      });

      if (next) {
        nextRide = {
          // Shape matches what the frontend expects from a ride_instance
          // row. `id` is null because no instance has been materialized
          // in PBT's own DB — the schedule lives on the series now.
          id: null,
          date: next.date,
          status: 'scheduled',
          starts_at: next.startsAt.toISOString(),
          current_location: null,
        };

        // "Other rides" for recurring series = a handful of upcoming
        // occurrences projected forward from next. Skip for one-offs,
        // which only have the one date.
        if (route.recurrence) {
          let cursor = next.startsAt;
          for (let i = 0; i < 8; i++) {
            const step = nextOccurrence(
              new Date(cursor.getTime() + 60_000), // one minute past the previous occurrence
              {
                recurrence: route.recurrence,
                firstDate,
                departureTime: route.departure_time,
                timezone: PBT_TIMEZONE,
              }
            );
            if (!step || step.date === next.date) break;
            otherRides.push({ id: null, date: step.date, status: 'scheduled' });
            cursor = step.startsAt;
          }
        }
      }

    } else {
      // (3) Legacy fallback — route predates migration 012/013.
      nextRide = await queryOne(`
        SELECT ri.*
        FROM ride_instances ri
        WHERE ri.route_id = $1
          AND ri.date >= CURRENT_DATE
          AND ri.status IN ('scheduled', 'live')
        ORDER BY ri.date ASC
        LIMIT 1
      `, [route.id]);

      otherRides = await queryAll(`
        SELECT ri.id, ri.date, ri.status
        FROM ride_instances ri
        WHERE ri.route_id = $1
          AND ri.date >= CURRENT_DATE
          AND ri.status IN ('scheduled', 'live')
          ${nextRide ? `AND ri.id != $2` : ''}
        ORDER BY ri.date ASC
        LIMIT 10
      `, nextRide ? [route.id, nextRide.id] : [route.id]);
    }

    res.json({
      success: true,
      data: {
        ...route,
        recurrence_label: humanizeRecurrence(route.recurrence),
        next_ride: nextRide || null,
        other_rides: otherRides,
      }
    });
  } catch (error) {
    console.error('Error fetching route by slug:', error);
    res.status(500).json({ error: 'Failed to fetch route', message: error.message });
  }
});

/**
 * GET /api/routes/:accessCode
 * Get route by access code
 */
router.get('/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params;

    const route = await queryOne(`
      SELECT * FROM routes
      WHERE access_code = $1
    `, [accessCode.toUpperCase()]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    res.json({
      success: true,
      data: route // waypoints already parsed
    });

  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({
      error: 'Failed to fetch route',
      message: error.message
    });
  }
});

/**
 * PUT /api/routes/:accessCode
 * Update route details (name, description, departure_time, waypoints)
 */
router.put('/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params;

    const route = await queryOne(`
      SELECT * FROM routes WHERE access_code = $1
    `, [accessCode.toUpperCase()]);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const UpdateRouteSchema = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2500).optional(),
      departure_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).optional(),
      waypoints: z.array(z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().optional()
      })).min(2).optional()
    });

    const data = UpdateRouteSchema.parse(req.body);

    const sets = [];
    const params = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      sets.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.departure_time !== undefined) {
      sets.push(`departure_time = $${paramIndex++}`);
      params.push(data.departure_time);
    }
    if (data.waypoints !== undefined) {
      sets.push(`waypoints = $${paramIndex++}`);
      params.push(JSON.stringify(data.waypoints));

      // Recalculate derived fields
      const previewImageUrl = generateRoutePreviewUrl(data.waypoints);
      sets.push(`preview_image_url = $${paramIndex++}`);
      params.push(previewImageUrl);

      const distanceMiles = calculateRouteDistance(data.waypoints);
      sets.push(`distance_miles = $${paramIndex++}`);
      params.push(distanceMiles);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(route.id);
    const updated = await queryOne(`
      UPDATE routes SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *
    `, params);

    console.log(`✏️  Route updated: ${updated.name} (${accessCode})`);

    res.json({ success: true, data: updated });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating route:', error);
    res.status(500).json({ error: 'Failed to update route', message: error.message });
  }
});

/**
 * POST /api/routes/:accessCode/schedule
 * Schedule ride instances for specific dates
 */
router.post('/:accessCode/schedule', async (req, res) => {
  try {
    const { accessCode } = req.params;

    // Validate input
    const { dates } = ScheduleRideSchema.parse(req.body);

    // Get route
    const route = await queryOne(`
      SELECT * FROM routes
      WHERE access_code = $1
    `, [accessCode.toUpperCase()]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Create ride instances for each date
    const instances = [];

    for (const date of dates) {
      // Check if a scheduled or live instance already exists for this date
      const existing = await queryOne(`
        SELECT id, status FROM ride_instances
        WHERE route_id = $1 AND date = $2
      `, [route.id, date]);

      if (existing) {
        if (existing.status === 'scheduled' || existing.status === 'live') {
          continue; // Skip if already scheduled or live
        }
        // Delete completed instance to allow re-scheduling
        await query(`DELETE FROM ride_instances WHERE id = $1`, [existing.id]);
      }

      // Create instance
      const instance = await queryOne(`
        INSERT INTO ride_instances (
          route_id, date, status, region_id
        )
        VALUES ($1, $2, 'scheduled', $3)
        RETURNING *
      `, [route.id, date, route.region_id]);

      instances.push(instance);
    }

    console.log(`✅ Scheduled ${instances.length} ride(s) for ${route.name}`);

    res.status(201).json({
      success: true,
      data: {
        route: route, // waypoints already parsed
        instances
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Error scheduling rides:', error);
    res.status(500).json({
      error: 'Failed to schedule rides',
      message: error.message
    });
  }
});

/**
 * GET /api/routes/:accessCode/next-ride
 * Get the next scheduled ride for a specific route
 * Perfect for embedding on external websites
 */
router.get('/:accessCode/next-ride', async (req, res) => {
  try {
    const { accessCode } = req.params;

    // Get route
    const route = await queryOne(`
      SELECT * FROM routes
      WHERE access_code = $1
    `, [accessCode.toUpperCase()]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Get next upcoming ride instance
    const nextRide = await queryOne(`
      SELECT ri.*
      FROM ride_instances ri
      WHERE ri.route_id = $1
        AND ri.date >= CURRENT_DATE
        AND ri.status IN ('scheduled', 'live')
      ORDER BY ri.date ASC, ri.created_at ASC
      LIMIT 1
    `, [route.id]);

    if (!nextRide) {
      return res.status(404).json({
        error: 'No upcoming rides scheduled for this route'
      });
    }

    res.json({
      success: true,
      data: {
        route: {
          access_code: route.access_code,
          name: route.name,
          description: route.description,
          waypoints: route.waypoints,
          departure_time: route.departure_time,
          tag: route.tag,
          preview_image_url: route.preview_image_url
        },
        next_ride: {
          id: nextRide.id,
          date: nextRide.date,
          status: nextRide.status,
          is_live: nextRide.status === 'live',
          current_location: nextRide.current_location || null
        }
      }
    });

  } catch (error) {
    console.error('Error fetching next ride:', error);
    res.status(500).json({
      error: 'Failed to fetch next ride',
      message: error.message
    });
  }
});

/**
 * POST /api/routes/:accessCode/upload-icon
 * Upload custom start location icon for a route
 */
router.post('/:accessCode/upload-icon', upload.single('icon'), async (req, res) => {
  try {
    const { accessCode } = req.params;

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    // Get route
    const route = await queryOne(`
      SELECT * FROM routes
      WHERE access_code = $1
    `, [accessCode.toUpperCase()]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Upload to Cloudinary
    const iconUrl = await uploadToCloudinary(req.file.buffer, 'route-icons');

    // Delete old icon if exists
    if (route.start_location_icon_url) {
      await deleteFromCloudinary(route.start_location_icon_url);
    }

    // Update route with new icon URL
    const updatedRoute = await queryOne(`
      UPDATE routes
      SET start_location_icon_url = $1
      WHERE id = $2
      RETURNING *
    `, [iconUrl, route.id]);

    console.log(`🎨 Icon uploaded for route: ${route.name}`);

    res.json({
      success: true,
      data: {
        start_location_icon_url: iconUrl
      }
    });

  } catch (error) {
    console.error('Error uploading icon:', error);
    res.status(500).json({
      error: 'Failed to upload icon',
      message: error.message
    });
  }
});

/**
 * DELETE /api/routes/:accessCode/icon
 * Remove custom start location icon from a route
 */
router.delete('/:accessCode/icon', async (req, res) => {
  try {
    const { accessCode } = req.params;

    // Get route
    const route = await queryOne(`
      SELECT * FROM routes
      WHERE access_code = $1
    `, [accessCode.toUpperCase()]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    if (!route.start_location_icon_url) {
      return res.status(400).json({
        error: 'Route has no custom icon'
      });
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(route.start_location_icon_url);

    // Remove from database
    await query(`
      UPDATE routes
      SET start_location_icon_url = NULL
      WHERE id = $1
    `, [route.id]);

    console.log(`🗑️  Icon removed from route: ${route.name}`);

    res.json({
      success: true,
      message: 'Icon removed successfully'
    });

  } catch (error) {
    console.error('Error removing icon:', error);
    res.status(500).json({
      error: 'Failed to remove icon',
      message: error.message
    });
  }
});

/**
 * GET /api/routes
 * List all approved routes (optionally filtered by region)
 */
router.get('/', async (req, res) => {
  try {
    const { region = 'philly' } = req.query;

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({
        error: 'Invalid region',
        message: `Region '${region}' does not exist`
      });
    }

    const routes = await queryAll(`
      SELECT
        r.*,
        COUNT(DISTINCT ri.id) as scheduled_rides_count
      FROM routes r
      LEFT JOIN ride_instances ri ON r.id = ri.route_id AND ri.date >= CURRENT_DATE
      WHERE r.status = 'approved'
        AND r.region_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 50
    `, [regionData.id]);

    res.json({
      success: true,
      data: routes // waypoints already parsed
    });

  } catch (error) {
    console.error('Error listing routes:', error);
    res.status(500).json({
      error: 'Failed to list routes',
      message: error.message
    });
  }
});

export default router;
