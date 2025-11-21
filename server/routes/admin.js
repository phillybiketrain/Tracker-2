/**
 * Admin API
 * Handles admin-only operations (route approval, etc.)
 */

import express from 'express';
import { query, queryOne, queryAll } from '../db/client.js';

const router = express.Router();

// Simple auth middleware (TODO: Implement proper JWT auth)
function requireAdmin(req, res, next) {
  const { authorization } = req.headers;

  if (!authorization || authorization !== 'admin123') {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  next();
}

/**
 * GET /api/admin/routes/pending
 * Get routes pending approval
 */
router.get('/routes/pending', requireAdmin, async (req, res) => {
  try {
    const routes = await queryAll(`
      SELECT * FROM routes
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      count: routes.length,
      data: routes
    });

  } catch (error) {
    console.error('Error fetching pending routes:', error);
    res.status(500).json({
      error: 'Failed to fetch pending routes',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/routes/:id/approve
 * Approve a route
 */
router.post('/routes/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const route = await queryOne(`
      UPDATE routes
      SET status = 'approved', approved_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    console.log(`✅ Route approved: ${route.name}`);

    res.json({
      success: true,
      data: route
    });

  } catch (error) {
    console.error('Error approving route:', error);
    res.status(500).json({
      error: 'Failed to approve route',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/routes/:id/reject
 * Reject a route
 */
router.post('/routes/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const route = await queryOne(`
      UPDATE routes
      SET status = 'rejected'
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    console.log(`❌ Route rejected: ${route.name}`);

    res.json({
      success: true,
      data: route
    });

  } catch (error) {
    console.error('Error rejecting route:', error);
    res.status(500).json({
      error: 'Failed to reject route',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM routes WHERE status = 'approved') as total_routes,
        (SELECT COUNT(*) FROM routes WHERE status = 'pending') as pending_routes,
        (SELECT COUNT(*) FROM ride_instances WHERE date >= CURRENT_DATE) as upcoming_rides,
        (SELECT COUNT(*) FROM ride_instances WHERE status = 'live') as live_rides,
        (SELECT COUNT(*) FROM email_subscribers) as total_subscribers
    `);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

export default router;
