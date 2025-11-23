/**
 * Email Subscription API
 * Handles public subscription and unsubscription
 */

import express from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, queryOne, queryAll } from '../db/client.js';
import { sendConfirmationEmail } from '../services/email.js';

const router = express.Router();

// Validation schemas
const SubscribeSchema = z.object({
  email: z.string().email(),
  region: z.string().optional(),
  all_routes: z.boolean().optional(),
  route_ids: z.array(z.string().uuid()).optional(),
  tags: z.array(z.enum(['community', 'regular', 'special'])).optional()
});

/**
 * POST /api/subscriptions/subscribe
 * Subscribe to email notifications
 */
router.post('/subscribe', async (req, res) => {
  try {
    const data = SubscribeSchema.parse(req.body);

    // Get region_id (default to philly)
    const regionSlug = data.region || 'philly';
    const region = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [regionSlug]);

    if (!region) {
      return res.status(400).json({
        error: 'Invalid region'
      });
    }

    // Check if already subscribed
    const existing = await queryOne(`
      SELECT * FROM email_subscribers
      WHERE email = $1 AND region_id = $2
    `, [data.email, region.id]);

    if (existing) {
      return res.status(400).json({
        error: 'This email is already subscribed'
      });
    }

    // Generate unsubscribe token
    const unsubscribeToken = nanoid(32);

    // Create subscriber
    const subscriber = await queryOne(`
      INSERT INTO email_subscribers (
        email,
        region_id,
        all_routes,
        route_ids,
        tags,
        unsubscribe_token
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      data.email,
      region.id,
      data.all_routes || false,
      data.route_ids || [],
      data.tags || [],
      unsubscribeToken
    ]);

    // Send confirmation email (async)
    sendConfirmationEmail(subscriber.id)
      .then(() => {
        console.log(`✅ Confirmation email sent to ${data.email}`);
      })
      .catch(err => {
        console.error(`Failed to send confirmation to ${data.email}:`, err);
      });

    res.status(201).json({
      success: true,
      message: 'Subscribed successfully. Check your email for confirmation.',
      data: {
        id: subscriber.id,
        email: subscriber.email
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.errors
      });
    }

    console.error('Subscribe error:', error);
    res.status(500).json({
      error: 'Failed to subscribe',
      message: error.message
    });
  }
});

/**
 * GET /api/subscriptions/unsubscribe
 * Unsubscribe from email notifications
 */
router.get('/unsubscribe', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: 'Unsubscribe token is required'
      });
    }

    // Find subscriber by token
    const subscriber = await queryOne(`
      SELECT s.*, r.name as region_name
      FROM email_subscribers s
      JOIN regions r ON s.region_id = r.id
      WHERE s.unsubscribe_token = $1
    `, [token]);

    if (!subscriber) {
      return res.status(404).json({
        error: 'Invalid unsubscribe token'
      });
    }

    // Delete subscriber
    await query(`
      DELETE FROM email_subscribers
      WHERE id = $1
    `, [subscriber.id]);

    console.log(`👋 Unsubscribed: ${subscriber.email} from ${subscriber.region_name}`);

    res.json({
      success: true,
      message: 'You have been unsubscribed successfully',
      email: subscriber.email
    });

  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({
      error: 'Failed to unsubscribe',
      message: error.message
    });
  }
});

/**
 * GET /api/subscriptions/preferences
 * Get subscriber preferences (for updating)
 */
router.get('/preferences', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: 'Token is required'
      });
    }

    const subscriber = await queryOne(`
      SELECT s.*, r.slug as region_slug, r.name as region_name
      FROM email_subscribers s
      JOIN regions r ON s.region_id = r.id
      WHERE s.unsubscribe_token = $1
    `, [token]);

    if (!subscriber) {
      return res.status(404).json({
        error: 'Invalid token'
      });
    }

    res.json({
      success: true,
      data: {
        email: subscriber.email,
        region: subscriber.region_slug,
        all_routes: subscriber.all_routes,
        route_ids: subscriber.route_ids,
        tags: subscriber.tags,
        verified: !!subscriber.verified_at
      }
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      error: 'Failed to get preferences',
      message: error.message
    });
  }
});

/**
 * PUT /api/subscriptions/preferences
 * Update subscriber preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const { token, all_routes, route_ids, tags } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Token is required'
      });
    }

    const subscriber = await queryOne(`
      UPDATE email_subscribers
      SET all_routes = $1,
          route_ids = $2,
          tags = $3
      WHERE unsubscribe_token = $4
      RETURNING *
    `, [all_routes, route_ids || [], tags || [], token]);

    if (!subscriber) {
      return res.status(404).json({
        error: 'Invalid token'
      });
    }

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        all_routes: subscriber.all_routes,
        route_ids: subscriber.route_ids,
        tags: subscriber.tags
      }
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      error: 'Failed to update preferences',
      message: error.message
    });
  }
});

export default router;
