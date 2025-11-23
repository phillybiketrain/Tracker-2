/**
 * Email Service using Mailgun SMTP
 * Handles template rendering and email sending
 */

import nodemailer from 'nodemailer';
import { query, queryOne, queryAll } from '../db/client.js';

// Create Mailgun SMTP transport
const transporter = nodemailer.createTransport({
  host: 'smtp.mailgun.org',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAILGUN_SMTP_USER,
    pass: process.env.MAILGUN_SMTP_PASSWORD
  }
});

/**
 * Get email template for a region
 */
async function getTemplate(regionId, templateType) {
  const template = await queryOne(`
    SELECT * FROM email_templates
    WHERE region_id = $1 AND template_type = $2
  `, [regionId, templateType]);

  return template;
}

/**
 * Render template with variables
 */
function renderTemplate(template, variables) {
  let subject = template.subject;
  let htmlBody = template.html_body;
  let textBody = template.text_body;

  // Replace all {{variable}} placeholders
  Object.keys(variables).forEach(key => {
    const placeholder = `{{${key}}}`;
    const value = variables[key] || '';

    subject = subject.replace(new RegExp(placeholder, 'g'), value);
    htmlBody = htmlBody.replace(new RegExp(placeholder, 'g'), value);
    textBody = textBody.replace(new RegExp(placeholder, 'g'), value);
  });

  return { subject, htmlBody, textBody };
}

/**
 * Send confirmation email when someone subscribes
 */
export async function sendConfirmationEmail(subscriberId) {
  try {
    const subscriber = await queryOne(`
      SELECT s.*, r.name as region_name, r.id as region_id
      FROM email_subscribers s
      JOIN regions r ON s.region_id = r.id
      WHERE s.id = $1
    `, [subscriberId]);

    if (!subscriber) {
      throw new Error(`Subscriber ${subscriberId} not found`);
    }

    // Get confirmation template
    const template = await getTemplate(subscriber.region_id, 'confirmation');

    if (!template) {
      console.error(`No confirmation template found for region ${subscriber.region_id}`);
      return;
    }

    // Build unsubscribe URL
    const unsubscribeUrl = `${process.env.PUBLIC_APP_URL}/unsubscribe?token=${subscriber.unsubscribe_token}`;

    // Render template
    const { subject, htmlBody, textBody } = renderTemplate(template, {
      unsubscribe_url: unsubscribeUrl,
      region_name: subscriber.region_name
    });

    // Send email
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
      replyTo: 'phillybiketrain@gmail.com',
      to: subscriber.email,
      subject,
      text: textBody,
      html: htmlBody
    });

    // Mark as verified
    await query(`
      UPDATE email_subscribers
      SET verified_at = NOW()
      WHERE id = $1
    `, [subscriberId]);

    console.log(`✅ Confirmation email sent to ${subscriber.email}`);

  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    throw error;
  }
}

/**
 * Send weekly digest to a subscriber
 */
export async function sendWeeklyDigest(subscriberId) {
  try {
    const subscriber = await queryOne(`
      SELECT s.*, r.name as region_name, r.id as region_id, r.slug as region_slug
      FROM email_subscribers s
      JOIN regions r ON s.region_id = r.id
      WHERE s.id = $1 AND s.verified_at IS NOT NULL
    `, [subscriberId]);

    if (!subscriber) {
      return; // Skip unverified or deleted subscribers
    }

    // Get upcoming rides for this week
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let ridesQuery;
    let ridesParams;

    if (subscriber.all_routes) {
      // Get all rides in region
      ridesQuery = `
        SELECT
          ri.date,
          ri.status,
          ro.name as route_name,
          ro.description,
          ro.departure_time,
          ro.tag
        FROM ride_instances ri
        JOIN routes ro ON ri.route_id = ro.id
        WHERE ro.region_id = $1
          AND ro.status = 'approved'
          AND ri.date >= $2
          AND ri.date <= $3
          AND ri.status IN ('scheduled', 'live')
        ORDER BY ri.date, ro.departure_time
      `;
      ridesParams = [subscriber.region_id, now.toISOString(), nextWeek.toISOString()];

    } else if (subscriber.route_ids && subscriber.route_ids.length > 0) {
      // Get rides for specific routes
      ridesQuery = `
        SELECT
          ri.date,
          ri.status,
          ro.name as route_name,
          ro.description,
          ro.departure_time,
          ro.tag
        FROM ride_instances ri
        JOIN routes ro ON ri.route_id = ro.id
        WHERE ro.id = ANY($1)
          AND ro.status = 'approved'
          AND ri.date >= $2
          AND ri.date <= $3
          AND ri.status IN ('scheduled', 'live')
        ORDER BY ri.date, ro.departure_time
      `;
      ridesParams = [subscriber.route_ids, now.toISOString(), nextWeek.toISOString()];

    } else if (subscriber.tags && subscriber.tags.length > 0) {
      // Get rides for specific tags
      ridesQuery = `
        SELECT
          ri.date,
          ri.status,
          ro.name as route_name,
          ro.description,
          ro.departure_time,
          ro.tag
        FROM ride_instances ri
        JOIN routes ro ON ri.route_id = ro.id
        WHERE ro.region_id = $1
          AND ro.tag = ANY($2)
          AND ro.status = 'approved'
          AND ri.date >= $3
          AND ri.date <= $4
          AND ri.status IN ('scheduled', 'live')
        ORDER BY ri.date, ro.departure_time
      `;
      ridesParams = [subscriber.region_id, subscriber.tags, now.toISOString(), nextWeek.toISOString()];

    } else {
      // No preferences set, skip
      return;
    }

    const rides = await queryAll(ridesQuery, ridesParams);

    if (rides.length === 0) {
      // No rides this week, skip
      return;
    }

    // Format rides as HTML and text
    let ridesHtml = '<div style="margin: 20px 0;">';
    let ridesText = '\n\n';

    rides.forEach(ride => {
      const date = new Date(ride.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });

      ridesHtml += `
        <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #E85D04; background: #f9f9f9;">
          <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">${ride.route_name}</div>
          <div style="color: #666; margin-bottom: 5px;">${ride.description || ''}</div>
          <div style="font-size: 14px; color: #333;">
            📅 ${date} at ${ride.departure_time}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 5px;">
            Tag: ${ride.tag}
          </div>
        </div>
      `;

      ridesText += `${ride.route_name}\n${ride.description || ''}\n📅 ${date} at ${ride.departure_time}\nTag: ${ride.tag}\n\n`;
    });

    ridesHtml += '</div>';

    // Get weekly digest template
    const template = await getTemplate(subscriber.region_id, 'weekly_digest');

    if (!template) {
      console.error(`No weekly_digest template found for region ${subscriber.region_id}`);
      return;
    }

    // Build unsubscribe URL
    const unsubscribeUrl = `${process.env.PUBLIC_APP_URL}/unsubscribe?token=${subscriber.unsubscribe_token}`;

    // Render template
    const { subject, htmlBody, textBody } = renderTemplate(template, {
      routes: rides.length > 0 ? ridesHtml : '<p>No rides scheduled this week.</p>',
      unsubscribe_url: unsubscribeUrl,
      region_name: subscriber.region_name
    });

    // Send email
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
      replyTo: 'phillybiketrain@gmail.com',
      to: subscriber.email,
      subject,
      text: textBody.replace('{{routes}}', ridesText),
      html: htmlBody
    });

    console.log(`✅ Weekly digest sent to ${subscriber.email} (${rides.length} rides)`);

  } catch (error) {
    console.error(`Failed to send weekly digest to subscriber ${subscriberId}:`, error);
  }
}

/**
 * Send email blast to all subscribers in a region
 */
export async function sendEmailBlast(blastId) {
  try {
    const blast = await queryOne(`
      SELECT b.*, r.id as region_id, r.name as region_name
      FROM email_blasts b
      JOIN regions r ON b.region_id = r.id
      WHERE b.id = $1
    `, [blastId]);

    if (!blast) {
      throw new Error(`Email blast ${blastId} not found`);
    }

    // Get all verified subscribers in this region
    const subscribers = await queryAll(`
      SELECT * FROM email_subscribers
      WHERE region_id = $1 AND verified_at IS NOT NULL
    `, [blast.region_id]);

    if (subscribers.length === 0) {
      console.log(`No verified subscribers in region ${blast.region_id}`);
      return 0;
    }

    // Get blast template
    const template = await getTemplate(blast.region_id, 'blast');

    if (!template) {
      console.error(`No blast template found for region ${blast.region_id}`);
      return 0;
    }

    let sentCount = 0;

    // Send to each subscriber
    for (const subscriber of subscribers) {
      try {
        const unsubscribeUrl = `${process.env.PUBLIC_APP_URL}/unsubscribe?token=${subscriber.unsubscribe_token}`;

        // Render template with custom message
        const { subject, htmlBody, textBody } = renderTemplate(template, {
          message: blast.body,
          unsubscribe_url: unsubscribeUrl,
          region_name: blast.region_name
        });

        // Use custom subject if provided, otherwise use template subject
        const finalSubject = blast.subject || subject;

        await transporter.sendMail({
          from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
          replyTo: 'phillybiketrain@gmail.com',
          to: subscriber.email,
          subject: finalSubject,
          text: textBody,
          html: htmlBody
        });

        sentCount++;

      } catch (error) {
        console.error(`Failed to send blast to ${subscriber.email}:`, error);
      }
    }

    // Update blast record with recipient count
    await query(`
      UPDATE email_blasts
      SET recipient_count = $1
      WHERE id = $2
    `, [sentCount, blastId]);

    console.log(`✅ Email blast sent to ${sentCount} subscribers`);

    return sentCount;

  } catch (error) {
    console.error('Failed to send email blast:', error);
    throw error;
  }
}

/**
 * Send weekly digests to all subscribers in a region
 */
export async function sendWeeklyDigestsForRegion(regionSlug) {
  try {
    const region = await queryOne(`
      SELECT * FROM regions WHERE slug = $1
    `, [regionSlug]);

    if (!region) {
      throw new Error(`Region ${regionSlug} not found`);
    }

    // Get all verified subscribers in this region
    const subscribers = await queryAll(`
      SELECT id FROM email_subscribers
      WHERE region_id = $1 AND verified_at IS NOT NULL
    `, [region.id]);

    console.log(`📧 Sending weekly digest to ${subscribers.length} subscribers in ${region.name}`);

    let sentCount = 0;

    for (const subscriber of subscribers) {
      try {
        await sendWeeklyDigest(subscriber.id);
        sentCount++;
      } catch (error) {
        console.error(`Failed to send digest to subscriber ${subscriber.id}:`, error);
      }
    }

    console.log(`✅ Weekly digest complete: ${sentCount}/${subscribers.length} sent successfully`);

    return sentCount;

  } catch (error) {
    console.error('Failed to send weekly digests:', error);
    throw error;
  }
}
