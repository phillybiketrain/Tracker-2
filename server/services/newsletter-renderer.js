/**
 * Newsletter Renderer Service
 * Converts block-based newsletter content to email-safe HTML via MJML
 */

import mjml2html from 'mjml';
import { queryAll } from '../db/client.js';

// Brand colors (matching Tailwind config)
const COLORS = {
  primary: '#FF9F66',      // Warm orange
  secondary: '#6FB3B8',    // Teal
  text: '#3F3D38',         // Warm gray 800
  textLight: '#6D6A61',    // Warm gray 600
  background: '#FAF9F7',   // Cream
  cardBg: '#F7F5F2',       // Warm gray 50
  white: '#FFFFFF',
  border: '#EDEAE5'        // Warm gray 100
};

/**
 * Render a newsletter to HTML
 * @param {Object} newsletter - Newsletter object with blocks array
 * @param {number} regionId - Region ID for fetching rides
 * @param {string} unsubscribeUrl - URL for unsubscribe link (optional for preview)
 * @returns {Promise<{html: string, errors: Array}>}
 */
export async function renderNewsletter(newsletter, regionId, unsubscribeUrl = '#') {
  const { blocks = [], subject, preheader } = newsletter;

  // Build MJML content from blocks
  const blockMjml = await Promise.all(
    blocks.map(block => renderBlock(block, regionId))
  );

  // Wrap in MJML document
  const mjmlContent = `
    <mjml>
      <mj-head>
        <mj-title>${escapeHtml(subject || 'Newsletter')}</mj-title>
        ${preheader ? `<mj-preview>${escapeHtml(preheader)}</mj-preview>` : ''}
        <mj-font name="Space Grotesk" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" />
        <mj-attributes>
          <mj-all font-family="'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" />
          <mj-text color="${COLORS.text}" line-height="1.6" font-size="16px" />
          <mj-section padding="0" />
        </mj-attributes>
        <mj-style>
          a { color: ${COLORS.primary}; text-decoration: underline; }
          .ride-card { border-left: 3px solid ${COLORS.primary}; }
          h1, h2, h3, h4 { letter-spacing: -0.02em; margin: 0; }
        </mj-style>
      </mj-head>
      <mj-body background-color="${COLORS.background}" width="600px">
        ${blockMjml.join('\n')}

        <!-- Footer is always added -->
        ${renderFooter(unsubscribeUrl)}
      </mj-body>
    </mjml>
  `;

  // Convert MJML to HTML
  const { html, errors } = mjml2html(mjmlContent, {
    validationLevel: 'soft',
    minify: false
  });

  if (errors && errors.length > 0) {
    console.warn('MJML rendering warnings:', errors);
  }

  return { html, errors: errors || [] };
}

/**
 * Render a single block to MJML
 */
async function renderBlock(block, regionId) {
  const { type, data = {}, settings = {} } = block;

  switch (type) {
    case 'header':
      return renderHeader(data);
    case 'text':
      return renderText(data, settings);
    case 'upcoming_rides':
      return await renderUpcomingRides(data, regionId);
    case 'photo':
      return renderPhoto(data, settings);
    case 'divider':
      return renderDivider(data);
    case 'footer':
      // Footer is handled separately at the end
      return '';
    default:
      console.warn(`Unknown block type: ${type}`);
      return '';
  }
}

/**
 * Render header block
 */
function renderHeader(data = {}) {
  const { title = 'Philly Bike Train', subtitle = '', backgroundColor = COLORS.primary } = data;

  return `
    <mj-section background-color="${backgroundColor}" padding="30px 20px">
      <mj-column>
        <mj-text align="center" color="${COLORS.white}" font-size="28px" font-weight="700" padding="0">
          ${escapeHtml(title)}
        </mj-text>
        ${subtitle ? `
          <mj-text align="center" color="${COLORS.white}" font-size="16px" font-weight="400" padding="10px 0 0 0">
            ${escapeHtml(subtitle)}
          </mj-text>
        ` : ''}
      </mj-column>
    </mj-section>
  `;
}

/**
 * Render text block with optional subhead and markdown-lite formatting
 */
function renderText(data = {}, settings = {}) {
  const { subhead = '', paragraphs = [], alignment = 'left' } = data;
  const { backgroundColor = COLORS.white, padding = 'md' } = settings;

  const paddingMap = {
    none: '0',
    sm: '15px 20px',
    md: '25px 20px',
    lg: '40px 20px'
  };

  const paddingValue = paddingMap[padding] || paddingMap.md;

  // Format paragraphs with markdown-lite (bold, italic, links)
  const formattedParagraphs = paragraphs.map(p => formatText(p)).join('</p><p style="margin: 0 0 15px 0;">');

  return `
    <mj-section background-color="${backgroundColor}" padding="${paddingValue}">
      <mj-column>
        ${subhead ? `
          <mj-text font-size="22px" font-weight="600" color="${COLORS.text}" padding="0 0 15px 0" align="${alignment}">
            ${escapeHtml(subhead)}
          </mj-text>
        ` : ''}
        ${paragraphs.length > 0 ? `
          <mj-text align="${alignment}" padding="0">
            <p style="margin: 0 0 15px 0;">${formattedParagraphs}</p>
          </mj-text>
        ` : ''}
      </mj-column>
    </mj-section>
  `;
}

/**
 * Render upcoming rides block - fetches real data from DB
 */
async function renderUpcomingRides(data = {}, regionId) {
  const {
    dateRange = 14,
    tags = [],
    limit = 5,
    showDescription = true,
    showDistance = false,
    title = 'Upcoming Rides'
  } = data;

  // Fetch rides from database
  let rides = [];
  try {
    const tagFilter = tags && tags.length > 0 ? 'AND r.tag = ANY($3)' : '';
    const params = tags && tags.length > 0
      ? [regionId, dateRange, tags, limit]
      : [regionId, dateRange, limit];

    rides = await queryAll(`
      SELECT
        ri.date,
        r.name as route_name,
        r.description,
        r.departure_time,
        r.distance_miles,
        r.tag
      FROM ride_instances ri
      JOIN routes r ON ri.route_id = r.id
      WHERE r.region_id = $1
        AND r.status = 'approved'
        AND ri.date >= CURRENT_DATE
        AND ri.date <= CURRENT_DATE + $2::integer
        AND ri.status IN ('scheduled', 'live')
        ${tagFilter}
      ORDER BY ri.date, r.departure_time
      LIMIT ${tags && tags.length > 0 ? '$4' : '$3'}
    `, params);
  } catch (error) {
    console.error('Error fetching rides for newsletter:', error);
  }

  if (rides.length === 0) {
    return `
      <mj-section background-color="${COLORS.white}" padding="25px 20px">
        <mj-column>
          <mj-text font-size="22px" font-weight="600" color="${COLORS.text}" padding="0 0 15px 0">
            ${escapeHtml(title)}
          </mj-text>
          <mj-text color="${COLORS.textLight}" padding="0">
            No upcoming rides scheduled at this time.
          </mj-text>
        </mj-column>
      </mj-section>
    `;
  }

  // Build ride cards
  const rideCards = rides.map(ride => {
    const date = new Date(ride.date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    return `
      <div style="margin-bottom: 15px; padding: 15px; border-left: 3px solid ${COLORS.primary}; background: ${COLORS.cardBg}; border-radius: 0 8px 8px 0;">
        <div style="font-weight: 600; font-size: 17px; color: ${COLORS.text}; margin-bottom: 5px;">
          ${escapeHtml(ride.route_name)}
        </div>
        ${showDescription && ride.description ? `
          <div style="color: ${COLORS.textLight}; font-size: 14px; margin-bottom: 8px;">
            ${escapeHtml(ride.description)}
          </div>
        ` : ''}
        <div style="font-size: 14px; color: ${COLORS.text};">
          ${date} at ${ride.departure_time}
          ${showDistance && ride.distance_miles ? ` &bull; ${ride.distance_miles} mi` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <mj-section background-color="${COLORS.white}" padding="25px 20px">
      <mj-column>
        <mj-text font-size="22px" font-weight="600" color="${COLORS.text}" padding="0 0 15px 0">
          ${escapeHtml(title)}
        </mj-text>
        <mj-text padding="0">
          ${rideCards}
        </mj-text>
      </mj-column>
    </mj-section>
  `;
}

/**
 * Render photo block
 */
function renderPhoto(data = {}, settings = {}) {
  const { images = [], layout = 'single' } = data;
  const { backgroundColor = COLORS.white, padding = 'md' } = settings;

  const paddingMap = {
    none: '0',
    sm: '15px 20px',
    md: '25px 20px',
    lg: '40px 20px'
  };

  const paddingValue = paddingMap[padding] || paddingMap.md;

  if (images.length === 0) {
    return '';
  }

  // Single image or side-by-side layout
  if (layout === 'single' || images.length === 1) {
    const img = images[0];
    return `
      <mj-section background-color="${backgroundColor}" padding="${paddingValue}">
        <mj-column>
          <mj-image src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt || '')}" border-radius="8px" padding="0" />
          ${img.caption ? `
            <mj-text font-size="14px" color="${COLORS.textLight}" align="center" padding="10px 0 0 0">
              ${escapeHtml(img.caption)}
            </mj-text>
          ` : ''}
        </mj-column>
      </mj-section>
    `;
  }

  // Side-by-side (2 images)
  const [img1, img2] = images;
  return `
    <mj-section background-color="${backgroundColor}" padding="${paddingValue}">
      <mj-column>
        <mj-image src="${escapeHtml(img1.url)}" alt="${escapeHtml(img1.alt || '')}" border-radius="8px" padding="0" />
        ${img1.caption ? `
          <mj-text font-size="14px" color="${COLORS.textLight}" align="center" padding="10px 0 0 0">
            ${escapeHtml(img1.caption)}
          </mj-text>
        ` : ''}
      </mj-column>
      <mj-column>
        <mj-image src="${escapeHtml(img2.url)}" alt="${escapeHtml(img2.alt || '')}" border-radius="8px" padding="0" />
        ${img2.caption ? `
          <mj-text font-size="14px" color="${COLORS.textLight}" align="center" padding="10px 0 0 0">
            ${escapeHtml(img2.caption)}
          </mj-text>
        ` : ''}
      </mj-column>
    </mj-section>
  `;
}

/**
 * Render divider block
 */
function renderDivider(data = {}) {
  const { style = 'line' } = data;

  switch (style) {
    case 'dots':
      return `
        <mj-section padding="20px 0">
          <mj-column>
            <mj-text align="center" color="${COLORS.textLight}" padding="0">
              &bull; &bull; &bull;
            </mj-text>
          </mj-column>
        </mj-section>
      `;
    case 'space':
      return `
        <mj-section padding="30px 0">
          <mj-column>
            <mj-text padding="0">&nbsp;</mj-text>
          </mj-column>
        </mj-section>
      `;
    case 'line':
    default:
      return `
        <mj-section padding="20px 20px">
          <mj-column>
            <mj-divider border-color="${COLORS.border}" border-width="1px" padding="0" />
          </mj-column>
        </mj-section>
      `;
  }
}

/**
 * Render footer block (always included)
 */
function renderFooter(unsubscribeUrl = '#') {
  return `
    <mj-section background-color="${COLORS.cardBg}" padding="30px 20px">
      <mj-column>
        <mj-text align="center" font-size="14px" color="${COLORS.textLight}" padding="0 0 10px 0">
          You're receiving this email because you subscribed to Philly Bike Train updates.
        </mj-text>
        <mj-text align="center" font-size="14px" color="${COLORS.textLight}" padding="0">
          <a href="${escapeHtml(unsubscribeUrl)}" style="color: ${COLORS.textLight};">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>
  `;
}

/**
 * Format text with markdown-lite syntax
 * Supports: **bold**, *italic*, [text](url)
 */
function formatText(text) {
  if (!text) return '';

  let formatted = escapeHtml(text);

  // Bold: **text**
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *text*
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links: [text](url)
  formatted = formatted.replace(/\[(.+?)\]\((.+?)\)/g, `<a href="$2" style="color: ${COLORS.primary};">$1</a>`);

  return formatted;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';

  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return String(text).replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Generate plain text version from blocks
 */
export function generatePlainText(newsletter, unsubscribeUrl = '#') {
  const { blocks = [] } = newsletter;
  let text = '';

  for (const block of blocks) {
    const { type, data = {} } = block;

    switch (type) {
      case 'header':
        text += `${'='.repeat(50)}\n${data.title || 'Philly Bike Train'}\n${'='.repeat(50)}\n\n`;
        if (data.subtitle) text += `${data.subtitle}\n\n`;
        break;

      case 'text':
        if (data.subhead) text += `${data.subhead}\n${'─'.repeat(30)}\n`;
        if (data.paragraphs) {
          text += data.paragraphs.map(p => stripMarkdown(p)).join('\n\n') + '\n\n';
        }
        break;

      case 'upcoming_rides':
        text += `${data.title || 'Upcoming Rides'}\n${'─'.repeat(30)}\n`;
        text += '(See HTML version for ride details)\n\n';
        break;

      case 'photo':
        if (data.images && data.images.length > 0) {
          text += '[Image]\n';
          if (data.images[0].caption) text += `${data.images[0].caption}\n`;
          text += '\n';
        }
        break;

      case 'divider':
        text += '\n' + '─'.repeat(50) + '\n\n';
        break;
    }
  }

  // Footer
  text += '\n' + '─'.repeat(50) + '\n';
  text += 'You\'re receiving this email because you subscribed to Philly Bike Train updates.\n';
  text += `Unsubscribe: ${unsubscribeUrl}\n`;

  return text;
}

/**
 * Strip markdown formatting for plain text
 */
function stripMarkdown(text) {
  if (!text) return '';

  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')     // Remove bold
    .replace(/\*(.+?)\*/g, '$1')          // Remove italic
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)'); // Convert links
}
