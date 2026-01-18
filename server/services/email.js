/**
 * Email Service using Mailgun HTTP API
 * Handles template rendering and email sending
 */

import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { query, queryOne, queryAll } from '../db/client.js';

// Initialize Mailgun client
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY
});

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;

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

    // Send email via Mailgun HTTP API
    await mg.messages.create(MAILGUN_DOMAIN, {
      from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
      'h:Reply-To': 'phillybiketrain@gmail.com',
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

        await mg.messages.create(MAILGUN_DOMAIN, {
          from: process.env.FROM_EMAIL || 'noreply@biketrain.org',
          'h:Reply-To': 'phillybiketrain@gmail.com',
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

