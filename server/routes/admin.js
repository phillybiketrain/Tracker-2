/**
 * Admin API
 * Handles admin authentication and operations
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { query, queryOne, queryAll } from '../db/client.js';
import { sendEmailBlast } from '../services/email.js';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../utils/upload.js';

const router = express.Router();

// Simple session store (in production, use Redis or similar)
// Exported for use by other routes that need admin auth
export const activeSessions = new Map();

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

// Auth middleware - exported for use by other routes
export function requireAdmin(req, res, next) {
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
    const { name, description, departure_time, tag, slug } = req.body;

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

    // Sanitize slug: lowercase, alphanumeric + hyphens only, or null to clear
    const cleanSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50) || null : (slug === '' ? null : undefined);

    const route = await queryOne(`
      UPDATE routes
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          departure_time = COALESCE($3, departure_time),
          tag = COALESCE($4, tag),
          slug = CASE WHEN $6 THEN $5 ELSE slug END
      WHERE id = $7
      RETURNING *
    `, [name, description, departure_time, tag, cleanSlug, cleanSlug !== undefined, id]);

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
 * POST /api/admin/rides/:id/end
 * Manually end a live ride
 */
router.post('/rides/:id/end', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get ride instance
    const ride = await queryOne(`
      SELECT ri.*, r.region_id, r.access_code, r.name
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

    if (ride.status !== 'live') {
      return res.status(400).json({
        error: `Ride is not live (current status: ${ride.status})`
      });
    }

    // End the ride
    await query(`
      UPDATE ride_instances
      SET status = 'completed',
          ended_at = NOW(),
          current_location = NULL,
          location_trail = '[]'::jsonb
      WHERE id = $1
    `, [id]);

    console.log(`🏁 Admin manually ended ride: ${ride.name} (${ride.access_code})`);

    res.json({
      success: true,
      message: `Ride "${ride.name}" ended successfully`
    });

  } catch (error) {
    console.error('Error ending ride:', error);
    res.status(500).json({
      error: 'Failed to end ride',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/rides/cleanup-stale
 * Mark stale live rides as completed (no GPS update in 60+ minutes)
 */
router.post('/rides/cleanup-stale', requireAdmin, async (req, res) => {
  try {
    // Find and end rides that:
    // 1. Are marked 'live'
    // 2. Haven't had a location update in 60+ minutes (or never had one)
    const result = await query(`
      UPDATE ride_instances
      SET status = 'completed',
          ended_at = NOW(),
          current_location = NULL,
          location_trail = '[]'::jsonb
      WHERE status = 'live'
        AND (
          started_at < NOW() - INTERVAL '60 minutes'
          OR started_at IS NULL
        )
      RETURNING id
    `);

    const count = result.rowCount || 0;

    console.log(`🧹 Cleaned up ${count} stale live ride(s)`);

    res.json({
      success: true,
      message: `Cleaned up ${count} stale ride(s)`,
      count
    });

  } catch (error) {
    console.error('Error cleaning up stale rides:', error);
    res.status(500).json({
      error: 'Failed to cleanup stale rides',
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
    if (req.admin.role !== 'super' && req.admin.region_id !== route.region_id) {
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
    if (req.admin.role !== 'super' && req.admin.region_id !== route.region_id) {
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

/**
 * GET /api/admin/subscribers
 * List all subscribers for a region
 */
router.get('/subscribers', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly', page = 1, limit = 50, search = '' } = req.query;

    console.log(`📋 GET subscribers request for region '${region}'`);

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    console.log(`📋 Found region_id: ${regionData?.id}`);

    if (!regionData) {
      return res.status(400).json({ error: 'Invalid region' });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== regionData.id) {
      return res.status(403).json({ error: 'Access denied to this region' });
    }

    // Build search filter
    const searchFilter = search ? 'AND s.email ILIKE $4' : '';
    const params = search
      ? [regionData.id, parseInt(limit), (parseInt(page) - 1) * parseInt(limit), `%${search}%`]
      : [regionData.id, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)];

    // Get total count
    const countParams = search ? [regionData.id, `%${search}%`] : [regionData.id];
    const { count } = await queryOne(`
      SELECT COUNT(*) as count
      FROM email_subscribers s
      WHERE s.region_id = $1 ${search ? 'AND s.email ILIKE $2' : ''}
    `, countParams);

    console.log(`📋 Found ${count} subscribers for region_id ${regionData.id}`);

    // Get subscribers
    const subscribers = await queryAll(`
      SELECT
        s.id,
        s.email,
        s.all_routes,
        s.tags,
        s.verified_at,
        s.subscribed_at,
        s.last_email_sent
      FROM email_subscribers s
      WHERE s.region_id = $1 ${searchFilter}
      ORDER BY s.subscribed_at DESC
      LIMIT $2 OFFSET $3
    `, params);

    res.json({
      success: true,
      data: subscribers,
      pagination: {
        total: parseInt(count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(count) / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({
      error: 'Failed to fetch subscribers',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/subscribers/:id
 * Remove a subscriber
 */
router.delete('/subscribers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get subscriber to check region access
    const subscriber = await queryOne(`
      SELECT s.*, r.slug as region_slug
      FROM email_subscribers s
      JOIN regions r ON s.region_id = r.id
      WHERE s.id = $1
    `, [id]);

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== subscriber.region_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete subscriber
    await query(`DELETE FROM email_subscribers WHERE id = $1`, [id]);

    console.log(`🗑️ Subscriber removed: ${subscriber.email}`);

    res.json({
      success: true,
      message: 'Subscriber removed'
    });

  } catch (error) {
    console.error('Error removing subscriber:', error);
    res.status(500).json({
      error: 'Failed to remove subscriber',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/subscribers/import
 * Bulk import subscribers from a list of emails
 */
router.post('/subscribers/import', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly', emails = [] } = req.body;

    if (!emails || emails.length === 0) {
      return res.status(400).json({ error: 'No emails provided' });
    }

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    console.log(`📥 Import request for region '${region}', found region_id: ${regionData?.id}`);

    if (!regionData) {
      return res.status(400).json({ error: 'Invalid region' });
    }

    // Check access
    if (req.admin.role !== 'super' && req.admin.region_id !== regionData.id) {
      return res.status(403).json({ error: 'Access denied to this region' });
    }

    // Validate and dedupe emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [...new Set(
      emails
        .map(e => e.trim().toLowerCase())
        .filter(e => emailRegex.test(e))
    )];

    if (validEmails.length === 0) {
      return res.status(400).json({ error: 'No valid email addresses found' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const email of validEmails) {
      try {
        // Check if already exists
        const existing = await queryOne(`
          SELECT id FROM email_subscribers WHERE email = $1 AND region_id = $2
        `, [email, regionData.id]);

        if (existing) {
          skipped++;
          continue;
        }

        // Generate unsubscribe token
        const unsubscribeToken = nanoid(32);

        // Insert subscriber (pre-verified since admin is importing)
        const inserted = await queryOne(`
          INSERT INTO email_subscribers (email, region_id, all_routes, unsubscribe_token, verified_at)
          VALUES ($1, $2, true, $3, NOW())
          RETURNING id, email
        `, [email, regionData.id, unsubscribeToken]);

        if (inserted) {
          imported++;
          console.log(`  ✓ Inserted subscriber ${inserted.id}: ${inserted.email}`);
        }
      } catch (err) {
        console.error(`  ✗ Failed to insert ${email}:`, err.message);
        errors.push({ email, error: err.message });
      }
    }

    // Verify the count in the database
    const { count: dbCount } = await queryOne(`
      SELECT COUNT(*) as count FROM email_subscribers WHERE region_id = $1
    `, [regionData.id]);

    console.log(`📥 Imported ${imported} subscribers, skipped ${skipped} duplicates. Total in DB: ${dbCount}`);

    res.json({
      success: true,
      imported,
      skipped,
      total: validEmails.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error importing subscribers:', error);
    res.status(500).json({
      error: 'Failed to import subscribers',
      message: error.message
    });
  }
});

// Helper function to generate session token (cryptographically secure)
function generateToken() {
  return nanoid(32);
}

export default router;
