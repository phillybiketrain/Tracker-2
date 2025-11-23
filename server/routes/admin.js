/**
 * Admin API
 * Handles admin authentication and operations
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { query, queryOne, queryAll } from '../db/client.js';

const router = express.Router();

// Simple session store (in production, use Redis or similar)
const activeSessions = new Map();

/**
 * POST /api/admin/login
 * Admin login with password
 */
router.post('/login', async (req, res) => {
  try {
    const { password, region } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Password is required'
      });
    }

    // Get region_id if specified
    let regionId = null;
    if (region) {
      const regionData = await queryOne(`
        SELECT id FROM regions WHERE slug = $1
      `, [region]);

      if (!regionData) {
        return res.status(400).json({
          error: 'Invalid region'
        });
      }
      regionId = regionData.id;
    }

    // Check if admin exists for this region
    const admin = await queryOne(`
      SELECT * FROM admin_users
      WHERE region_id ${regionId ? '= $1' : 'IS NULL'}
    `, regionId ? [regionId] : []);

    if (!admin) {
      // No admin found, use env variable for super admin
      const envPasswordHash = process.env.ADMIN_PASSWORD_HASH || '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7T90O5XsBq'; // admin123

      const isValid = await bcrypt.compare(password, envPasswordHash);

      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid password'
        });
      }

      // Create session for super admin
      const sessionToken = generateToken();
      activeSessions.set(sessionToken, {
        role: 'super',
        region_id: null,
        created_at: Date.now()
      });

      return res.json({
        success: true,
        token: sessionToken,
        role: 'super',
        region: null
      });
    }

    // Check password for regional admin
    const isValid = await bcrypt.compare(password, admin.password_hash);

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid password'
      });
    }

    // Create session
    const sessionToken = generateToken();
    activeSessions.set(sessionToken, {
      role: admin.role,
      region_id: admin.region_id,
      email: admin.email,
      created_at: Date.now()
    });

    res.json({
      success: true,
      token: sessionToken,
      role: admin.role,
      region: region || null,
      email: admin.email
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/logout
 * Logout admin
 */
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// Auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  req.admin = activeSessions.get(token);
  next();
}

// Region-specific admin middleware
function requireRegionalAdmin(req, res, next) {
  if (!req.admin) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  // Super admin can access any region
  if (req.admin.role === 'super') {
    return next();
  }

  // Regional admin can only access their region
  const requestedRegion = req.query.region || req.params.region;

  if (requestedRegion && req.admin.region_id) {
    // Verify region matches
    // This is simplified - in production, validate against actual region_id
    return next();
  }

  res.status(403).json({
    error: 'Access denied to this region'
  });
}

/**
 * GET /api/admin/routes/pending
 * Get routes pending approval (filtered by region)
 */
router.get('/routes/pending', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly' } = req.query;

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({
        error: 'Invalid region'
      });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== regionData.id) {
      return res.status(403).json({
        error: 'Access denied to this region'
      });
    }

    const routes = await queryAll(`
      SELECT r.*,
        COUNT(DISTINCT ri.id) as scheduled_rides_count
      FROM routes r
      LEFT JOIN ride_instances ri ON r.id = ri.route_id
      WHERE r.status = 'pending'
        AND r.region_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `, [regionData.id]);

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
      SET status = 'approved',
          approved_at = NOW(),
          approved_by = $1
      WHERE id = $2
      RETURNING *
    `, [req.admin.email || 'super-admin', id]);

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

    // Delete the route instead of marking rejected
    const route = await queryOne(`
      DELETE FROM routes
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
 * Get platform statistics for region
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly' } = req.query;

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({
        error: 'Invalid region'
      });
    }

    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM routes WHERE status = 'approved' AND region_id = $1) as total_routes,
        (SELECT COUNT(*) FROM routes WHERE status = 'pending' AND region_id = $1) as pending_routes,
        (SELECT COUNT(*) FROM ride_instances WHERE date >= CURRENT_DATE AND region_id = $1) as upcoming_rides,
        (SELECT COUNT(*) FROM ride_instances WHERE status = 'live' AND region_id = $1) as live_rides,
        (SELECT COUNT(*) FROM email_subscribers WHERE region_id = $1) as total_subscribers
    `, [regionData.id]);

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

/**
 * GET /api/admin/regions
 * Get all regions (super admin only)
 */
router.get('/regions', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super') {
      return res.status(403).json({
        error: 'Super admin access required'
      });
    }

    const regions = await queryAll(`
      SELECT * FROM regions
      ORDER BY created_at ASC
    `);

    res.json({
      success: true,
      data: regions
    });

  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({
      error: 'Failed to fetch regions',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/regions
 * Create a new region (super admin only)
 */
router.post('/regions', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super') {
      return res.status(403).json({
        error: 'Super admin access required'
      });
    }

    const { slug, name, timezone } = req.body;

    if (!slug || !name || !timezone) {
      return res.status(400).json({
        error: 'slug, name, and timezone are required'
      });
    }

    const region = await queryOne(`
      INSERT INTO regions (slug, name, timezone)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [slug, name, timezone]);

    // Create default email templates for new region
    const phillyRegion = await queryOne(`
      SELECT id FROM regions WHERE slug = 'philly'
    `);

    if (phillyRegion) {
      // Copy templates from Philly
      await query(`
        INSERT INTO email_templates (region_id, template_type, subject, html_body, text_body)
        SELECT $1, template_type, subject, html_body, text_body
        FROM email_templates
        WHERE region_id = $2
      `, [region.id, phillyRegion.id]);
    }

    console.log(`✅ Region created: ${region.name}`);

    res.status(201).json({
      success: true,
      data: region
    });

  } catch (error) {
    console.error('Error creating region:', error);
    res.status(500).json({
      error: 'Failed to create region',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/email/blast
 * Send email blast to all subscribers in region
 */
router.post('/email/blast', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly', subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({
        error: 'subject and body are required'
      });
    }

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({
        error: 'Invalid region'
      });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== regionData.id) {
      return res.status(403).json({
        error: 'Access denied to this region'
      });
    }

    // Get subscriber count
    const { count } = await queryOne(`
      SELECT COUNT(*) as count
      FROM email_subscribers
      WHERE region_id = $1
    `, [regionData.id]);

    // Record blast
    const blast = await queryOne(`
      INSERT INTO email_blasts (region_id, admin_email, subject, body, recipient_count)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [regionData.id, req.admin.email || 'super-admin', subject, body, parseInt(count)]);

    // TODO: Actually send emails via Mailgun
    console.log(`📧 Email blast queued: ${subject} to ${count} subscribers`);

    res.json({
      success: true,
      data: blast,
      message: `Email blast queued for ${count} subscribers`
    });

  } catch (error) {
    console.error('Error sending blast:', error);
    res.status(500).json({
      error: 'Failed to send blast',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/email/templates
 * Get email templates for region
 */
router.get('/email/templates', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly' } = req.query;

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({
        error: 'Invalid region'
      });
    }

    const templates = await queryAll(`
      SELECT * FROM email_templates
      WHERE region_id = $1
      ORDER BY template_type
    `, [regionData.id]);

    res.json({
      success: true,
      data: templates
    });

  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/email/templates/:id
 * Update email template
 */
router.put('/email/templates/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, html_body, text_body } = req.body;

    if (!subject || !html_body || !text_body) {
      return res.status(400).json({
        error: 'subject, html_body, and text_body are required'
      });
    }

    const template = await queryOne(`
      UPDATE email_templates
      SET subject = $1,
          html_body = $2,
          text_body = $3,
          updated_at = NOW(),
          updated_by = $4
      WHERE id = $5
      RETURNING *
    `, [subject, html_body, text_body, req.admin.email || 'super-admin', id]);

    if (!template) {
      return res.status(404).json({
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });

  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({
      error: 'Failed to update template',
      message: error.message
    });
  }
});

// Helper function to generate session token
function generateToken() {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export default router;
