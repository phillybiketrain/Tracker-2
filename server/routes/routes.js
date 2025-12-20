/**
 * Routes API
 * Handles creating routes and scheduling ride instances
 */

import express from 'express';
import { query, queryOne, queryAll } from '../db/client.js';
import { z } from 'zod';
import { generateRoutePreviewUrl } from '../utils/mapbox.js';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../utils/upload.js';
import { calculateRouteDistance } from '../utils/geo.js';

const router = express.Router();

// Validation schemas
const CreateRouteSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  waypoints: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().optional()
  })).min(2),
  departure_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  estimated_duration: z.string().optional(),
  creator_email: z.string().email().optional(),
  tag: z.enum(['community', 'regular', 'special']).optional(),
  region: z.string().optional() // Region slug (defaults to 'philly')
});

const ScheduleRideSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1)
});

/**
 * POST /api/routes
 * Create a new route
 */
router.post('/', async (req, res) => {
  try {
    // Validate input
    const data = CreateRouteSchema.parse(req.body);

    // Get region_id (default to philly)
    const regionSlug = data.region || 'philly';
    const region = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [regionSlug]);

    if (!region) {
      return res.status(400).json({
        error: 'Invalid region',
        message: `Region '${regionSlug}' does not exist`
      });
    }

    // Generate 4-letter access code
    const accessCode = await queryOne(
      'SELECT generate_access_code() as code'
    );

    // Generate static preview image URL
    const previewImageUrl = generateRoutePreviewUrl(data.waypoints);

    // Calculate route distance
    const distanceMiles = calculateRouteDistance(data.waypoints);

    // Create route (auto-approved)
    const route = await queryOne(`
      INSERT INTO routes (
        access_code, name, description, waypoints,
        departure_time, estimated_duration, creator_email,
        status, tag, region_id, preview_image_url, distance_miles
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      accessCode.code,
      data.name,
      data.description || null,
      JSON.stringify(data.waypoints), // JSONB accepts string
      data.departure_time,
      data.estimated_duration || null,
      data.creator_email || null,
      'approved', // Auto-approve routes
      data.tag || 'community',
      region.id,
      previewImageUrl,
      distanceMiles
    ]);

    console.log(`✅ Route created: ${route.name} (${route.access_code})`);

    res.status(201).json({
      success: true,
      data: route // waypoints already parsed by pg driver
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Validation error creating route:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('❌ Error creating route:', error);
    res.status(500).json({
      error: 'Failed to create route',
      message: error.message
    });
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
      // Check if instance already exists
      const existing = await queryOne(`
        SELECT id FROM ride_instances
        WHERE route_id = $1 AND date = $2
      `, [route.id, date]);

      if (existing) {
        continue; // Skip if already scheduled
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
      SELECT
        ri.*,
        COUNT(DISTINCT rf.session_id) as follower_count,
        COUNT(DISTINCT rint.session_id) as interest_count
      FROM ride_instances ri
      LEFT JOIN ride_followers rf ON ri.id = rf.ride_instance_id
      LEFT JOIN ride_interest rint ON ri.id = rint.ride_instance_id
      WHERE ri.route_id = $1
        AND ri.date >= CURRENT_DATE
        AND ri.status IN ('scheduled', 'live')
      GROUP BY ri.id
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
          estimated_duration: route.estimated_duration,
          tag: route.tag,
          preview_image_url: route.preview_image_url
        },
        next_ride: {
          id: nextRide.id,
          date: nextRide.date,
          status: nextRide.status,
          follower_count: parseInt(nextRide.follower_count),
          interest_count: parseInt(nextRide.interest_count),
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
