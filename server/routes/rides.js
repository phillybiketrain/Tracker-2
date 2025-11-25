/**
 * Rides API
 * Handles browsing and managing ride instances
 */

import express from 'express';
import { query, queryOne, queryAll } from '../db/client.js';
import { z } from 'zod';

const router = express.Router();

/**
 * GET /api/rides/live
 * Get all currently live rides across all regions
 */
router.get('/live', async (req, res) => {
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

    const liveRides = await queryAll(`
      SELECT
        ri.*,
        r.access_code,
        r.name as route_name,
        r.description as route_description,
        r.waypoints,
        r.departure_time,
        r.estimated_duration,
        r.tag,
        r.preview_image_url,
        r.start_location_icon_url,
        COUNT(DISTINCT rf.session_id) as follower_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      LEFT JOIN ride_followers rf ON ri.id = rf.ride_instance_id
      WHERE ri.status = 'live'
        AND ri.region_id = $1
        AND r.status = 'approved'
      GROUP BY ri.id, r.id
      ORDER BY ri.started_at DESC
    `, [regionData.id]);

    res.json({
      success: true,
      count: liveRides.length,
      data: liveRides.map(ride => ({
        ...ride,
        follower_count: parseInt(ride.follower_count)
      }))
    });

  } catch (error) {
    console.error('Error loading live rides:', error);
    res.status(500).json({
      error: 'Failed to load live rides',
      message: error.message
    });
  }
});

/**
 * GET /api/rides
 * Browse upcoming ride instances (filtered by region)
 */
router.get('/', async (req, res) => {
  try {
    const {
      from_date = new Date().toISOString().split('T')[0],
      days = 7,
      limit = 50,
      region = 'philly',
      route_id // Optional filter by specific route
    } = req.query;

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

    // Build WHERE clause based on filters
    let whereClause = `
      WHERE ri.date >= $1
        AND ri.date <= $1::date + $2::integer
        AND ri.status IN ('scheduled', 'live')
        AND ri.region_id = $4
    `;

    const params = [from_date, days, limit, regionData.id];

    // Add route_id filter if provided
    if (route_id) {
      whereClause += ` AND ri.route_id = $5`;
      params.push(route_id);
    } else {
      // Only filter by approved status if not filtering by specific route
      whereClause += ` AND r.status = 'approved'`;
    }

    const rides = await queryAll(`
      SELECT
        ri.*,
        r.access_code,
        r.name as route_name,
        r.description as route_description,
        r.waypoints,
        r.departure_time,
        r.estimated_duration,
        r.tag,
        r.preview_image_url,
        r.start_location_icon_url,
        COUNT(DISTINCT rf.session_id) as follower_count,
        COUNT(DISTINCT rint.session_id) as interest_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      LEFT JOIN ride_followers rf ON ri.id = rf.ride_instance_id
      LEFT JOIN ride_interest rint ON ri.id = rint.ride_instance_id
      ${whereClause}
      GROUP BY ri.id, r.id
      ORDER BY ri.date ASC, r.departure_time ASC
      LIMIT $3
    `, params);

    res.json({
      success: true,
      count: rides.length,
      data: rides.map(ride => ({
        ...ride,
        follower_count: parseInt(ride.follower_count),
        interest_count: parseInt(ride.interest_count)
      }))
    });

  } catch (error) {
    console.error('Error browsing rides:', error);
    res.status(500).json({
      error: 'Failed to browse rides',
      message: error.message
    });
  }
});

/**
 * GET /api/rides/:id
 * Get specific ride instance details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ride = await queryOne(`
      SELECT
        ri.*,
        r.access_code,
        r.name as route_name,
        r.description as route_description,
        r.waypoints,
        r.departure_time,
        r.estimated_duration,
        r.start_location_icon_url,
        COUNT(DISTINCT rf.session_id) as follower_count,
        COUNT(DISTINCT rint.session_id) as interest_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      LEFT JOIN ride_followers rf ON ri.id = rf.ride_instance_id
      LEFT JOIN ride_interest rint ON ri.id = rint.ride_instance_id
      WHERE ri.id = $1
      GROUP BY ri.id, r.id
    `, [id]);

    if (!ride) {
      return res.status(404).json({
        error: 'Ride not found'
      });
    }

    // Get other ride instances for this route
    const otherRides = await queryAll(`
      SELECT
        ri.id,
        ri.date,
        ri.status,
        COUNT(DISTINCT rint.session_id) as interest_count
      FROM ride_instances ri
      LEFT JOIN ride_interest rint ON ri.id = rint.ride_instance_id
      WHERE ri.route_id = $1
        AND ri.id != $2
        AND ri.date >= CURRENT_DATE
        AND ri.status IN ('scheduled', 'live')
      GROUP BY ri.id
      ORDER BY ri.date ASC
      LIMIT 10
    `, [ride.route_id, id]);

    res.json({
      success: true,
      data: {
        ...ride,
        current_location: ride.current_location || null,
        location_trail: ride.location_trail || [],
        follower_count: parseInt(ride.follower_count),
        interest_count: parseInt(ride.interest_count),
        other_rides: otherRides.map(r => ({
          ...r,
          interest_count: parseInt(r.interest_count)
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching ride:', error);
    res.status(500).json({
      error: 'Failed to fetch ride',
      message: error.message
    });
  }
});

/**
 * DELETE /api/rides/:id
 * Delete a scheduled ride (requires access code)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { access_code } = req.body;

    if (!access_code) {
      return res.status(400).json({
        error: 'access_code is required'
      });
    }

    // Verify access code and that ride belongs to this route
    const ride = await queryOne(`
      SELECT ri.*, r.access_code
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      WHERE ri.id = $1
    `, [id]);

    if (!ride) {
      return res.status(404).json({
        error: 'Ride not found'
      });
    }

    if (ride.access_code !== access_code) {
      return res.status(403).json({
        error: 'Invalid access code'
      });
    }

    if (ride.status === 'live') {
      return res.status(400).json({
        error: 'Cannot delete a live ride. End the ride first.'
      });
    }

    if (ride.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot delete a completed ride'
      });
    }

    // Delete the ride instance
    await query(`DELETE FROM ride_instances WHERE id = $1`, [id]);

    console.log(`🗑️  Ride ${id} deleted`);

    res.json({
      success: true,
      message: 'Ride deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting ride:', error);
    res.status(500).json({
      error: 'Failed to delete ride',
      message: error.message
    });
  }
});

/**
 * POST /api/rides/:id/interest
 * Express interest in a ride
 */
router.post('/:id/interest', async (req, res) => {
  try {
    const { id } = req.params;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        error: 'session_id is required'
      });
    }

    // Add interest (ignore if already exists)
    await query(`
      INSERT INTO ride_interest (ride_instance_id, session_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [id, session_id]);

    // Get updated count
    const result = await queryOne(`
      SELECT COUNT(*) as count
      FROM ride_interest
      WHERE ride_instance_id = $1
    `, [id]);

    console.log(`👋 Interest added for ride ${id}`);

    res.json({
      success: true,
      interest_count: parseInt(result.count)
    });

  } catch (error) {
    console.error('Error adding interest:', error);
    res.status(500).json({
      error: 'Failed to add interest',
      message: error.message
    });
  }
});

/**
 * GET /api/rides/by-code/:accessCode
 * Get active ride by access code (for followers)
 */
router.get('/by-code/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params;

    // Get today's ride for this access code
    const ride = await queryOne(`
      SELECT
        ri.*,
        r.access_code,
        r.name as route_name,
        r.description as route_description,
        r.waypoints,
        r.departure_time,
        r.estimated_duration,
        COUNT(DISTINCT rf.session_id) as follower_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      LEFT JOIN ride_followers rf ON ri.id = rf.ride_instance_id
      WHERE r.access_code = $1
        AND ri.date = CURRENT_DATE
        AND ri.status IN ('scheduled', 'live')
      GROUP BY ri.id, r.id
    `, [accessCode.toUpperCase()]);

    if (!ride) {
      return res.status(404).json({
        error: 'No active ride found for this code today'
      });
    }

    res.json({
      success: true,
      data: {
        ...ride,
        current_location: ride.current_location || null,
        location_trail: ride.location_trail || [],
        follower_count: parseInt(ride.follower_count)
      }
    });

  } catch (error) {
    console.error('Error fetching ride by code:', error);
    res.status(500).json({
      error: 'Failed to fetch ride',
      message: error.message
    });
  }
});

export default router;
