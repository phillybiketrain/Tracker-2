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
import * as gothere from '../services/gothere.js';

const router = express.Router();

// PBT is Philadelphia-only for now; when regions gain their own timezones
// this moves to the `regions` table.
const PBT_TIMEZONE = 'America/New_York';

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
  // YYYY-MM-DD, interpreted in PBT_TIMEZONE. Combined with departure_time to
  // produce the ISO-with-offset startsAt that GoThere wants.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  creator_email: z.string().email().optional(),
  tag: z.enum(['community', 'regular', 'special']).optional(),
  region: z.string().optional() // Region slug (defaults to 'philly')
});

const ScheduleRideSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1)
});

/**
 * POST /api/routes
 * Create a new one-off route and publish it through GoThere → Commons.
 *
 * Saga on failure: if any GoThere call throws after a ride has been created
 * on the GoThere side, we attempt a best-effort `deleteRide` rollback so we
 * don't leave orphaned drafts floating around. Recurring routes will go
 * through a sibling endpoint in Batch 3.
 */
router.post('/', async (req, res) => {
  let gothereRideId = null; // captured once we create the GoThere ride; used for rollback

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

    // ── GoThere saga ────────────────────────────────────────────────────
    // Build the ISO-with-offset startsAt GoThere's Zod validator requires.
    const startsAt = toIsoWithOffset(data.date, data.departure_time, PBT_TIMEZONE);

    // First waypoint is the ride's "start location." Use its address if the
    // creator captured one; otherwise fall back to the route name.
    const first = data.waypoints[0];
    const startLocationName = first.address || data.name;

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

    const gpx = buildGpxFile(data.waypoints, data.name);
    await gothere.uploadRideRoute(gothereRideId, gpx);
    await gothere.publishRide(gothereRideId);
    const gtCode = await gothere.mintRideCollaboratorCode(gothereRideId);

    // ── Local state ─────────────────────────────────────────────────────
    // Legacy access_code is still used by the existing broadcast/manage UIs.
    // Once those move fully to GoThere (Batch 6) we'll stop generating it.
    const accessCode = await queryOne('SELECT generate_access_code() as code');
    const previewImageUrl = generateRoutePreviewUrl(data.waypoints);
    const distanceMiles = calculateRouteDistance(data.waypoints);

    const route = await queryOne(`
      INSERT INTO routes (
        access_code, name, description, waypoints,
        departure_time, creator_email,
        status, tag, region_id, preview_image_url, distance_miles,
        date,
        gothere_ride_id, gothere_slug, gothere_collaborator_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      gothereRideId,
      gtRide.slug,
      gtCode.code,
    ]);

    // Legacy: mirror the date into ride_instances so pages that query it
    // (e.g. /[slug] "next ride") keep working during the transition.
    // Removed in Batch 6.
    await query(`
      INSERT INTO ride_instances (route_id, date, status, region_id)
      VALUES ($1, $2, 'scheduled', $3)
      ON CONFLICT (route_id, date) DO NOTHING
    `, [route.id, data.date, region.id]);

    console.log(
      `✅ Route created: ${route.name} — PBT ${route.access_code} / GoThere ${gtCode.code} @ ${gtRide.slug}`
    );

    res.status(201).json({ success: true, data: route });

  } catch (error) {
    // Saga rollback: if we got as far as creating the GoThere ride,
    // try to delete it so we don't leave an orphaned record.
    if (gothereRideId) {
      try {
        await gothere.deleteRide(gothereRideId);
        console.warn(`🗑️  Rolled back GoThere ride ${gothereRideId}`);
      } catch (rollbackErr) {
        console.error(
          `⚠️  Failed to rollback GoThere ride ${gothereRideId}:`,
          rollbackErr.message
        );
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
 * Get route and its next ride by vanity URL slug
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

    const nextRide = await queryOne(`
      SELECT ri.*
      FROM ride_instances ri
      WHERE ri.route_id = $1
        AND ri.date >= CURRENT_DATE
        AND ri.status IN ('scheduled', 'live')
      ORDER BY ri.date ASC
      LIMIT 1
    `, [route.id]);

    const otherRides = await queryAll(`
      SELECT ri.id, ri.date, ri.status
      FROM ride_instances ri
      WHERE ri.route_id = $1
        AND ri.date >= CURRENT_DATE
        AND ri.status IN ('scheduled', 'live')
        ${nextRide ? `AND ri.id != $2` : ''}
      ORDER BY ri.date ASC
      LIMIT 10
    `, nextRide ? [route.id, nextRide.id] : [route.id]);

    res.json({
      success: true,
      data: {
        ...route,
        next_ride: nextRide || null,
        other_rides: otherRides
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
