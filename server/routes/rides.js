/**
 * Rides API
 * Handles browsing and managing ride instances
 */

import express from 'express';
import { query, queryOne, queryAll } from '../db/client.js';
import { z } from 'zod';

const router = express.Router();

/**
 * GET /api/rides
 * Browse upcoming ride instances
 */
router.get('/', async (req, res) => {
  try {
    const {
      from_date = new Date().toISOString().split('T')[0],
      days = 7,
      limit = 50
    } = req.query;

    const rides = await queryAll(`
      SELECT
        ri.*,
        r.access_code,
        r.name as route_name,
        r.description as route_description,
        r.waypoints,
        r.departure_time,
        r.estimated_duration,
        COUNT(DISTINCT rf.session_id) as follower_count,
        COUNT(DISTINCT rint.session_id) as interest_count
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      LEFT JOIN ride_followers rf ON ri.id = rf.ride_instance_id
      LEFT JOIN ride_interest rint ON ri.id = rint.ride_instance_id
      WHERE ri.date >= $1
        AND ri.date <= $1::date + $2::integer
        AND ri.status IN ('scheduled', 'live')
        AND r.status = 'approved'
      GROUP BY ri.id, r.id
      ORDER BY ri.date ASC, r.departure_time ASC
      LIMIT $3
    `, [from_date, days, limit]);

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

    res.json({
      success: true,
      data: {
        ...ride,
        current_location: ride.current_location || null,
        location_trail: ride.location_trail || [],
        follower_count: parseInt(ride.follower_count),
        interest_count: parseInt(ride.interest_count)
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
