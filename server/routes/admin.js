/**
 * Admin API
 * Handles admin authentication and operations
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { query, queryOne, queryAll } from '../db/client.js';
import { sendEmailBlast } from '../services/email.js';
import { triggerWeeklyDigestForRegion } from '../services/scheduler.js';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../utils/upload.js';

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

      console.log('Super admin login attempt:');
      console.log('- Password provided:', password ? '(provided)' : '(empty)');
      console.log('- Hash from env:', envPasswordHash ? '(set)' : '(not set)');
      console.log('- Hash value:', envPasswordHash);

      const isValid = await bcrypt.compare(password, envPasswordHash);

      console.log('- Password valid:', isValid);

      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid password'
        });
      }

      // Create session for super admin (30 days)
      const sessionToken = generateToken();
      activeSessions.set(sessionToken, {
        role: 'super',
        region_id: null,
        created_at: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
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

    // Create session (30 days)
    const sessionToken = generateToken();
    activeSessions.set(sessionToken, {
      role: admin.role,
      region_id: admin.region_id,
      email: admin.email,
      created_at: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
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

  const session = activeSessions.get(token);

  // Check if session has expired
  if (session.expiresAt && Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({
      error: 'Session expired'
    });
  }

  req.admin = session;
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
    `, [regionData.id, req.admin.email || 'super-admin', subject, body, 0]);

    // Send emails via Mailgun
    console.log(`📧 Sending email blast: ${subject} to subscribers in ${region}`);

    // Send asynchronously
    sendEmailBlast(blast.id)
      .then(sentCount => {
        console.log(`✅ Email blast complete: ${sentCount} emails sent`);
      })
      .catch(err => {
        console.error(`❌ Email blast failed:`, err);
      });

    res.json({
      success: true,
      data: blast,
      message: `Email blast is being sent to all verified subscribers`
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

/**
 * POST /api/admin/email/send-digest
 * Manually trigger weekly digest for testing
 */
router.post('/email/send-digest', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly' } = req.body;

    // Check access
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({
        error: 'Invalid region'
      });
    }

    if (req.admin.role !== 'super' && req.admin.region_id !== regionData.id) {
      return res.status(403).json({
        error: 'Access denied to this region'
      });
    }

    console.log(`🧪 Manually triggering weekly digest for ${region}`);

    // Send digests
    const sentCount = await triggerWeeklyDigestForRegion(region);

    res.json({
      success: true,
      message: `Weekly digest sent to ${sentCount} subscribers`,
      sent_count: sentCount
    });

  } catch (error) {
    console.error('Error sending digest:', error);
    res.status(500).json({
      error: 'Failed to send digest',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/users
 * Get all admin users for a region (super admin only)
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super') {
      return res.status(403).json({
        error: 'Super admin access required'
      });
    }

    const { region } = req.query;

    let users;
    if (region) {
      const regionData = await queryOne(`
        SELECT id FROM regions WHERE slug = $1
      `, [region]);

      if (!regionData) {
        return res.status(400).json({
          error: 'Invalid region'
        });
      }

      users = await queryAll(`
        SELECT email, role, region_id, created_at
        FROM admin_users
        WHERE region_id = $1
        ORDER BY created_at DESC
      `, [regionData.id]);
    } else {
      users = await queryAll(`
        SELECT email, role, region_id, created_at
        FROM admin_users
        ORDER BY created_at DESC
      `);
    }

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({
      error: 'Failed to fetch admin users',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/users
 * Create new admin user for a region (super admin only)
 */
router.post('/users', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super') {
      return res.status(403).json({
        error: 'Super admin access required'
      });
    }

    const { email, password, region, role = 'admin' } = req.body;

    if (!email || !password || !region) {
      return res.status(400).json({
        error: 'email, password, and region are required'
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

    // Check if user already exists
    const existing = await queryOne(`
      SELECT id FROM admin_users WHERE email = $1
    `, [email]);

    if (existing) {
      return res.status(400).json({
        error: 'Admin user with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user
    const user = await queryOne(`
      INSERT INTO admin_users (email, password_hash, role, region_id)
      VALUES ($1, $2, $3, $4)
      RETURNING email, role, region_id, created_at
    `, [email, passwordHash, role, regionData.id]);

    console.log(`✅ Admin user created: ${email} for region ${region}`);

    res.status(201).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({
      error: 'Failed to create admin user',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Remove admin user (super admin only)
 */
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super') {
      return res.status(403).json({
        error: 'Super admin access required'
      });
    }

    const { id: email } = req.params; // id param is actually email

    const user = await queryOne(`
      DELETE FROM admin_users
      WHERE email = $1
      RETURNING email
    `, [email]);

    if (!user) {
      return res.status(404).json({
        error: 'Admin user not found'
      });
    }

    console.log(`🗑️  Admin user removed: ${user.email}`);

    res.json({
      success: true,
      message: 'Admin user removed'
    });

  } catch (error) {
    console.error('Error removing admin user:', error);
    res.status(500).json({
      error: 'Failed to remove admin user',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/routes/all
 * Get all routes for management (including pending)
 */
router.get('/routes/all', requireAdmin, async (req, res) => {
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
        COUNT(DISTINCT ri.id) as scheduled_rides_count,
        MAX(ri.date) as last_ride_date
      FROM routes r
      LEFT JOIN ride_instances ri ON r.id = ri.route_id
      WHERE r.region_id = $1
      GROUP BY r.id
      ORDER BY
        CASE r.status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          ELSE 3
        END,
        r.created_at DESC
    `, [regionData.id]);

    res.json({
      success: true,
      data: routes
    });

  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({
      error: 'Failed to fetch routes',
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/routes/:id
 * Update route details
 */
router.put('/routes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, departure_time, estimated_duration, tag } = req.body;

    // Get route to check access
    const existingRoute = await queryOne(`
      SELECT region_id FROM routes WHERE id = $1
    `, [id]);

    if (!existingRoute) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== existingRoute.region_id) {
      return res.status(403).json({
        error: 'Access denied to this region'
      });
    }

    const route = await queryOne(`
      UPDATE routes
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          departure_time = COALESCE($3, departure_time),
          estimated_duration = COALESCE($4, estimated_duration),
          tag = COALESCE($5, tag)
      WHERE id = $6
      RETURNING *
    `, [name, description, departure_time, estimated_duration, tag, id]);

    console.log(`✏️  Route updated: ${route.name}`);

    res.json({
      success: true,
      data: route
    });

  } catch (error) {
    console.error('Error updating route:', error);
    res.status(500).json({
      error: 'Failed to update route',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/routes/:id
 * Delete a route (removes all scheduled rides too)
 */
router.delete('/routes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get route to check access
    const existingRoute = await queryOne(`
      SELECT region_id, name FROM routes WHERE id = $1
    `, [id]);

    if (!existingRoute) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== existingRoute.region_id) {
      return res.status(403).json({
        error: 'Access denied to this region'
      });
    }

    // Delete route (cascade will handle ride_instances)
    await query(`
      DELETE FROM routes WHERE id = $1
    `, [id]);

    console.log(`🗑️  Route deleted: ${existingRoute.name}`);

    res.json({
      success: true,
      message: 'Route and all scheduled rides deleted'
    });

  } catch (error) {
    console.error('Error deleting route:', error);
    res.status(500).json({
      error: 'Failed to delete route',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/rides
 * Create new ride instances for a route
 */
router.post('/rides', requireAdmin, async (req, res) => {
  try {
    const { route_id, dates } = req.body;

    if (!route_id || !dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        error: 'route_id and dates array are required'
      });
    }

    // Get route to check access
    const route = await queryOne(`
      SELECT id, region_id FROM routes WHERE id = $1
    `, [route_id]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== route.region_id) {
      return res.status(403).json({
        error: 'Access denied to this region'
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

    res.json({
      success: true,
      message: `Created ${instances.length} ride instance(s)`,
      data: instances
    });

  } catch (error) {
    console.error('Error creating ride instances:', error);
    res.status(500).json({
      error: 'Failed to create ride instances',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/rides/:id
 * Delete a ride instance
 */
router.delete('/rides/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get ride instance to check access
    const ride = await queryOne(`
      SELECT ri.*, r.region_id
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      WHERE ri.id = $1
    `, [id]);

    if (!ride) {
      return res.status(404).json({
        error: 'Ride instance not found'
      });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== ride.region_id) {
      return res.status(403).json({
        error: 'Access denied to this region'
      });
    }

    // Delete the ride instance
    await query(`DELETE FROM ride_instances WHERE id = $1`, [id]);

    res.json({
      success: true,
      message: 'Ride instance deleted'
    });

  } catch (error) {
    console.error('Error deleting ride instance:', error);
    res.status(500).json({
      error: 'Failed to delete ride instance',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/routes/:routeId/upload-icon
 * Upload or update start location icon for a route (admin only)
 */
router.post('/routes/:routeId/upload-icon', requireAdmin, upload.single('icon'), async (req, res) => {
  try {
    const { routeId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    // Get route with region check
    const route = await queryOne(`
      SELECT r.*, reg.name as region_name
      FROM routes r
      JOIN regions reg ON r.region_id = reg.id
      WHERE r.id = $1
    `, [routeId]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Check region access
    const hasAccess = await checkRegionAccess(req.session.userId, route.region_id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: `You do not have access to the ${route.region_name} region`
      });
    }

    // Upload to Cloudinary
    const iconUrl = await uploadToCloudinary(req.file.buffer, 'route-icons');

    // Delete old icon if exists
    if (route.start_location_icon_url) {
      await deleteFromCloudinary(route.start_location_icon_url);
    }

    // Update route with new icon URL
    await query(`
      UPDATE routes
      SET start_location_icon_url = $1
      WHERE id = $2
    `, [iconUrl, route.id]);

    console.log(`🎨 Admin updated icon for route: ${route.name}`);

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
 * DELETE /api/admin/routes/:routeId/icon
 * Remove start location icon from a route (admin only)
 */
router.delete('/routes/:routeId/icon', requireAdmin, async (req, res) => {
  try {
    const { routeId } = req.params;

    // Get route with region check
    const route = await queryOne(`
      SELECT r.*, reg.name as region_name
      FROM routes r
      JOIN regions reg ON r.region_id = reg.id
      WHERE r.id = $1
    `, [routeId]);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    // Check region access
    const hasAccess = await checkRegionAccess(req.session.userId, route.region_id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: `You do not have access to the ${route.region_name} region`
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

    console.log(`🗑️  Admin removed icon from route: ${route.name}`);

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

// Helper function to generate session token
function generateToken() {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export default router;
