/**
 * Newsletter API Routes
 * Handles CRUD operations, preview, and sending for block-based newsletters
 */

import express from 'express';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { query, queryOne, queryAll } from '../db/client.js';
import { renderNewsletter, generatePlainText } from '../services/newsletter-renderer.js';
import { upload } from '../utils/upload.js';
import { requireAdmin } from './admin.js';

const router = express.Router();

// Initialize Mailgun
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY
});
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;

/**
 * GET /api/admin/newsletters
 * List all newsletters for a region
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly', status, page = 1, limit = 20 } = req.query;

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({ error: 'Invalid region' });
    }

    // Build query
    let whereClause = 'WHERE n.region_id = $1';
    const params = [regionData.id];

    if (status) {
      params.push(status);
      whereClause += ` AND n.status = $${params.length}`;
    }

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM newsletters n
      ${whereClause}
    `, params);

    // Get newsletters with pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const newsletters = await queryAll(`
      SELECT
        n.id,
        n.name,
        n.subject,
        n.status,
        n.created_at,
        n.created_by,
        n.updated_at,
        n.sent_at,
        n.recipient_count
      FROM newsletters n
      ${whereClause}
      ORDER BY n.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: newsletters,
      pagination: {
        total: parseInt(countResult.total),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countResult.total) / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching newsletters:', error);
    res.status(500).json({
      error: 'Failed to fetch newsletters',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/newsletters/:id
 * Get a single newsletter with all data
 */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const newsletter = await queryOne(`
      SELECT * FROM newsletters WHERE id = $1
    `, [id]);

    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    res.json({
      success: true,
      data: newsletter
    });

  } catch (error) {
    console.error('Error fetching newsletter:', error);
    res.status(500).json({
      error: 'Failed to fetch newsletter',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/newsletters
 * Create a new newsletter
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { region = 'philly', name, subject = '', preheader = '', blocks = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Newsletter name is required' });
    }

    // Get region_id
    const regionData = await queryOne(`
      SELECT id FROM regions WHERE slug = $1
    `, [region]);

    if (!regionData) {
      return res.status(400).json({ error: 'Invalid region' });
    }

    // Ensure blocks has header and footer if not provided
    let finalBlocks = blocks;
    if (finalBlocks.length === 0) {
      finalBlocks = [
        { id: 'header-1', type: 'header', data: { title: 'Philly Bike Train' }, settings: {} },
        { id: 'text-1', type: 'text', data: { subhead: '', paragraphs: [''] }, settings: {} }
      ];
    }

    const newsletter = await queryOne(`
      INSERT INTO newsletters (region_id, name, subject, preheader, blocks, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING *
    `, [regionData.id, name, subject, preheader, JSON.stringify(finalBlocks), req.admin?.email || 'admin']);

    console.log(`📰 Newsletter created: ${name}`);

    res.status(201).json({
      success: true,
      data: newsletter
    });

  } catch (error) {
    console.error('Error creating newsletter:', error);
    res.status(500).json({
      error: 'Failed to create newsletter',
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/newsletters/:id
 * Update a newsletter (auto-save)
 */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, preheader, blocks } = req.body;

    // Check if newsletter exists and is a draft
    const existing = await queryOne(`
      SELECT status FROM newsletters WHERE id = $1
    `, [id]);

    if (!existing) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    if (existing.status === 'sent') {
      return res.status(400).json({ error: 'Cannot edit a sent newsletter' });
    }

    // Build dynamic update
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }
    if (subject !== undefined) {
      paramCount++;
      updates.push(`subject = $${paramCount}`);
      params.push(subject);
    }
    if (preheader !== undefined) {
      paramCount++;
      updates.push(`preheader = $${paramCount}`);
      params.push(preheader);
    }
    if (blocks !== undefined) {
      paramCount++;
      updates.push(`blocks = $${paramCount}`);
      params.push(JSON.stringify(blocks));
    }

    // Always update timestamp
    updates.push('updated_at = NOW()');
    paramCount++;
    updates.push(`updated_by = $${paramCount}`);
    params.push(req.admin?.email || 'admin');

    // Add ID as last param
    paramCount++;
    params.push(id);

    const newsletter = await queryOne(`
      UPDATE newsletters
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, params);

    res.json({
      success: true,
      data: newsletter
    });

  } catch (error) {
    console.error('Error updating newsletter:', error);
    res.status(500).json({
      error: 'Failed to update newsletter',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/newsletters/:id
 * Delete a draft newsletter
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if newsletter exists
    const existing = await queryOne(`
      SELECT status, name FROM newsletters WHERE id = $1
    `, [id]);

    if (!existing) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    if (existing.status === 'sent') {
      return res.status(400).json({ error: 'Cannot delete a sent newsletter' });
    }

    await query(`DELETE FROM newsletters WHERE id = $1`, [id]);

    console.log(`🗑️ Newsletter deleted: ${existing.name}`);

    res.json({
      success: true,
      message: 'Newsletter deleted'
    });

  } catch (error) {
    console.error('Error deleting newsletter:', error);
    res.status(500).json({
      error: 'Failed to delete newsletter',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/newsletters/:id/duplicate
 * Clone a newsletter as a new draft
 */
router.post('/:id/duplicate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const original = await queryOne(`
      SELECT * FROM newsletters WHERE id = $1
    `, [id]);

    if (!original) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    const newNewsletter = await queryOne(`
      INSERT INTO newsletters (region_id, name, subject, preheader, blocks, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING *
    `, [
      original.region_id,
      `${original.name} (Copy)`,
      original.subject,
      original.preheader,
      JSON.stringify(original.blocks),
      req.admin?.email || 'admin'
    ]);

    console.log(`📰 Newsletter duplicated: ${original.name}`);

    res.status(201).json({
      success: true,
      data: newNewsletter
    });

  } catch (error) {
    console.error('Error duplicating newsletter:', error);
    res.status(500).json({
      error: 'Failed to duplicate newsletter',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/newsletters/:id/preview
 * Generate HTML preview (can also accept blocks directly for live preview)
 */
router.post('/:id/preview', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { blocks: bodyBlocks } = req.body;

    let newsletter;
    let regionId;

    if (id === 'new') {
      // Preview for unsaved newsletter
      const { region = 'philly' } = req.body;
      const regionData = await queryOne(`SELECT id FROM regions WHERE slug = $1`, [region]);
      if (!regionData) {
        return res.status(400).json({ error: 'Invalid region' });
      }
      regionId = regionData.id;
      newsletter = {
        subject: req.body.subject || 'Preview',
        preheader: req.body.preheader || '',
        blocks: bodyBlocks || []
      };
    } else {
      // Load newsletter from DB
      newsletter = await queryOne(`
        SELECT n.*, r.id as region_id
        FROM newsletters n
        JOIN regions r ON n.region_id = r.id
        WHERE n.id = $1
      `, [id]);

      if (!newsletter) {
        return res.status(404).json({ error: 'Newsletter not found' });
      }

      regionId = newsletter.region_id;

      // Use body blocks if provided (for live preview while editing)
      if (bodyBlocks) {
        newsletter.blocks = bodyBlocks;
      }
    }

    const { html, errors } = await renderNewsletter(newsletter, regionId, '#');

    res.json({
      success: true,
      html,
      errors
    });

  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({
      error: 'Failed to generate preview',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/newsletters/:id/test
 * Send test email to specified address
 */
router.post('/:id/test', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Test email address is required' });
    }

    const newsletter = await queryOne(`
      SELECT n.*, r.id as region_id
      FROM newsletters n
      JOIN regions r ON n.region_id = r.id
      WHERE n.id = $1
    `, [id]);

    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    if (!newsletter.subject) {
      return res.status(400).json({ error: 'Newsletter must have a subject line' });
    }

    // Generate HTML with test unsubscribe URL
    const unsubscribeUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:5173'}/unsubscribe?token=test`;
    const { html, errors } = await renderNewsletter(newsletter, newsletter.region_id, unsubscribeUrl);

    if (errors && errors.length > 0) {
      console.warn('MJML errors during test send:', errors);
    }

    // Generate plain text version
    const plainText = generatePlainText(newsletter, unsubscribeUrl);

    // Send via Mailgun
    await mg.messages.create(MAILGUN_DOMAIN, {
      from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
      'h:Reply-To': 'phillybiketrain@gmail.com',
      to: email,
      subject: `[TEST] ${newsletter.subject}`,
      text: plainText,
      html: html
    });

    // Update last test info
    await query(`
      UPDATE newsletters
      SET last_test_sent_at = NOW(), last_test_email = $1
      WHERE id = $2
    `, [email, id]);

    console.log(`📧 Test email sent to ${email} for newsletter: ${newsletter.name}`);

    res.json({
      success: true,
      message: `Test email sent to ${email}`
    });

  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/newsletters/:id/send
 * Send newsletter to all subscribers
 */
router.post('/:id/send', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const newsletter = await queryOne(`
      SELECT n.*, r.id as region_id, r.name as region_name
      FROM newsletters n
      JOIN regions r ON n.region_id = r.id
      WHERE n.id = $1
    `, [id]);

    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    if (newsletter.status === 'sent') {
      return res.status(400).json({ error: 'Newsletter has already been sent' });
    }

    if (!newsletter.subject) {
      return res.status(400).json({ error: 'Newsletter must have a subject line' });
    }

    // Get all verified subscribers
    const subscribers = await queryAll(`
      SELECT * FROM email_subscribers
      WHERE region_id = $1 AND verified_at IS NOT NULL
    `, [newsletter.region_id]);

    if (subscribers.length === 0) {
      return res.status(400).json({ error: 'No verified subscribers to send to' });
    }

    console.log(`📧 Starting newsletter send: "${newsletter.name}" to ${subscribers.length} subscribers`);

    // Mark as sent (optimistic)
    await query(`
      UPDATE newsletters
      SET status = 'sent', sent_at = NOW(), recipient_count = 0
      WHERE id = $1
    `, [id]);

    // Send to each subscriber in background
    let sentCount = 0;
    const sendPromises = subscribers.map(async (subscriber) => {
      try {
        const unsubscribeUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:5173'}/unsubscribe?token=${subscriber.unsubscribe_token}`;
        const { html } = await renderNewsletter(newsletter, newsletter.region_id, unsubscribeUrl);
        const plainText = generatePlainText(newsletter, unsubscribeUrl);

        await mg.messages.create(MAILGUN_DOMAIN, {
          from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
          'h:Reply-To': 'phillybiketrain@gmail.com',
          to: subscriber.email,
          subject: newsletter.subject,
          text: plainText,
          html: html
        });

        sentCount++;
      } catch (err) {
        console.error(`Failed to send to ${subscriber.email}:`, err.message);
      }
    });

    // Process sends (in batches to avoid overwhelming Mailgun)
    const batchSize = 10;
    for (let i = 0; i < sendPromises.length; i += batchSize) {
      await Promise.all(sendPromises.slice(i, i + batchSize));
    }

    // Update final count
    await query(`
      UPDATE newsletters
      SET recipient_count = $1
      WHERE id = $2
    `, [sentCount, id]);

    console.log(`✅ Newsletter sent: ${sentCount}/${subscribers.length} successful`);

    res.json({
      success: true,
      message: `Newsletter sent to ${sentCount} subscribers`,
      recipient_count: sentCount,
      total_subscribers: subscribers.length
    });

  } catch (error) {
    console.error('Error sending newsletter:', error);
    res.status(500).json({
      error: 'Failed to send newsletter',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/newsletters/upload-image
 * Upload an image for use in newsletters
 */
router.post('/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // Upload to Cloudinary with newsletter-specific settings
    const url = await uploadToCloudinaryNewsletter(req.file.buffer);

    res.json({
      success: true,
      url
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      error: 'Failed to upload image',
      message: error.message
    });
  }
});

/**
 * Upload image to Cloudinary with newsletter-specific transformations
 */
async function uploadToCloudinaryNewsletter(buffer) {
  const cloudinary = (await import('cloudinary')).v2;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'newsletter-images',
        resource_type: 'image',
        transformation: [
          { width: 600, crop: 'limit' }, // Max width for emails
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log(`✅ Newsletter image uploaded: ${result.secure_url}`);
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

export default router;
