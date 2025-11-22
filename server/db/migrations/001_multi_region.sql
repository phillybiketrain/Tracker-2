-- ============================================
-- MULTI-REGION MIGRATION
-- Adds support for multiple regional bike trains
-- ============================================

-- ============================================
-- REGIONS
-- ============================================
CREATE TABLE IF NOT EXISTS regions (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,         -- philly, portland, etc.
  name            TEXT NOT NULL,                -- Philly Bike Train, Portland Bike Train
  timezone        TEXT NOT NULL,                -- America/New_York, America/Los_Angeles
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default Philly region
INSERT INTO regions (slug, name, timezone)
VALUES ('philly', 'Philly Bike Train', 'America/New_York')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- UPDATE ADMIN_USERS
-- Add region support (null = super admin)
-- ============================================
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS region_id INTEGER REFERENCES regions(id);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'regional'; -- super | regional

-- Make existing admin a super admin
UPDATE admin_users SET role = 'super' WHERE region_id IS NULL;

-- ============================================
-- UPDATE ROUTES
-- Convert region text to region_id
-- ============================================
ALTER TABLE routes ADD COLUMN IF NOT EXISTS region_id INTEGER REFERENCES regions(id);

-- Set region_id for existing philly routes
UPDATE routes
SET region_id = (SELECT id FROM regions WHERE slug = 'philly')
WHERE region IS NOT NULL AND region_id IS NULL;

-- ============================================
-- UPDATE RIDE_INSTANCES
-- Add region_id for faster querying
-- ============================================
ALTER TABLE ride_instances ADD COLUMN IF NOT EXISTS region_id INTEGER REFERENCES regions(id);

-- Set region_id based on route
UPDATE ride_instances ri
SET region_id = r.region_id
FROM routes r
WHERE ri.route_id = r.id AND ri.region_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ride_instances_region ON ride_instances(region_id);

-- ============================================
-- ENHANCED EMAIL_SUBSCRIBERS
-- Support route/tag preferences per region
-- ============================================
DROP TABLE IF EXISTS email_subscribers CASCADE;

CREATE TABLE email_subscribers (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL,
  region_id         INTEGER NOT NULL REFERENCES regions(id),

  -- Subscription preferences
  all_routes        BOOLEAN DEFAULT false,      -- Subscribe to all routes in region
  route_ids         UUID[] DEFAULT '{}',        -- Specific routes
  tags              TEXT[] DEFAULT '{}',        -- community, regular, special

  -- Metadata
  unsubscribe_token TEXT UNIQUE NOT NULL,
  verified_at       TIMESTAMPTZ,                -- Set when confirmation email sent (no click required)
  subscribed_at     TIMESTAMPTZ DEFAULT NOW(),
  last_email_sent   TIMESTAMPTZ,

  UNIQUE(email, region_id)
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_region ON email_subscribers(region_id);

-- ============================================
-- EMAIL_TEMPLATES
-- Editable email templates per region
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id                SERIAL PRIMARY KEY,
  region_id         INTEGER NOT NULL REFERENCES regions(id),
  template_type     TEXT NOT NULL,              -- weekly_digest | confirmation | blast

  subject           TEXT NOT NULL,
  html_body         TEXT NOT NULL,
  text_body         TEXT NOT NULL,

  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_by        TEXT,                       -- admin email

  UNIQUE(region_id, template_type)
);

-- Insert default templates for Philly
INSERT INTO email_templates (region_id, template_type, subject, html_body, text_body)
VALUES
(
  (SELECT id FROM regions WHERE slug = 'philly'),
  'weekly_digest',
  'Your Weekly Bike Train Schedule',
  '<h1>Upcoming Bike Trains This Week</h1><p>{{routes}}</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  'Upcoming Bike Trains This Week\n\n{{routes}}\n\nUnsubscribe: {{unsubscribe_url}}'
),
(
  (SELECT id FROM regions WHERE slug = 'philly'),
  'confirmation',
  'Welcome to Philly Bike Train!',
  '<h1>You''re subscribed!</h1><p>You''ll receive weekly updates about bike trains matching your preferences.</p>',
  'You''re subscribed! You''ll receive weekly updates about bike trains matching your preferences.'
),
(
  (SELECT id FROM regions WHERE slug = 'philly'),
  'blast',
  'Important Update from Philly Bike Train',
  '<p>{{message}}</p>',
  '{{message}}'
)
ON CONFLICT (region_id, template_type) DO NOTHING;

-- ============================================
-- EMAIL_BLASTS
-- Manual email blasts sent by admins
-- ============================================
CREATE TABLE IF NOT EXISTS email_blasts (
  id                SERIAL PRIMARY KEY,
  region_id         INTEGER NOT NULL REFERENCES regions(id),
  admin_email       TEXT NOT NULL,

  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,

  sent_at           TIMESTAMPTZ DEFAULT NOW(),
  recipient_count   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_blasts_region ON email_blasts(region_id);

-- ============================================
-- ADD TAG FIELD TO ROUTES
-- ============================================
ALTER TABLE routes ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'community'; -- community | regular | special

CREATE INDEX IF NOT EXISTS idx_routes_tag ON routes(tag);

-- ============================================
-- HELPER FUNCTION: Generate unsubscribe token
-- ============================================
CREATE OR REPLACE FUNCTION generate_unsubscribe_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;
