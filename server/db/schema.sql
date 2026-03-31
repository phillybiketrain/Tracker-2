-- Philly Bike Train Database Schema

-- ============================================
-- ROUTES (Fixed paths with departure times)
-- ============================================
CREATE TABLE IF NOT EXISTS routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code     TEXT UNIQUE NOT NULL,

  -- Core attributes
  slug            TEXT UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  waypoints       JSONB NOT NULL,
  departure_time  TIME NOT NULL,
  distance_miles  DECIMAL(5,1),

  -- Metadata
  creator_email   TEXT,
  region_id       INTEGER,  -- FK to regions; populated by 001_multi_region.sql
  status          TEXT DEFAULT 'approved',
  tag             TEXT DEFAULT 'community',
  preview_image_url         TEXT,
  start_location_icon_url   TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_access_code ON routes(access_code);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
CREATE INDEX IF NOT EXISTS idx_routes_region ON routes(region_id);

-- ============================================
-- RIDE_INSTANCES (Specific date broadcasts)
-- ============================================
CREATE TABLE IF NOT EXISTS ride_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id          UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,

  date              DATE NOT NULL,
  status            TEXT DEFAULT 'scheduled', -- scheduled | live | completed | cancelled

  -- Live tracking (populated when status = 'live')
  current_location  JSONB,       -- {lat, lng, timestamp} — latest position only
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,

  region_id         INTEGER,     -- FK to regions; populated by 001_multi_region.sql

  UNIQUE(route_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ride_instances_date ON ride_instances(date);
CREATE INDEX IF NOT EXISTS idx_ride_instances_status ON ride_instances(status);
CREATE INDEX IF NOT EXISTS idx_ride_instances_route ON ride_instances(route_id);

-- ============================================
-- ADMIN_USERS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
  email             TEXT PRIMARY KEY,
  password_hash     TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Default admin (change password after first login)
INSERT INTO admin_users (email, password_hash)
VALUES ('admin@phillybiketrain.org', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7T90O5XsBq')
ON CONFLICT (email) DO NOTHING;

-- email_subscribers table is created by migrations/001_multi_region.sql

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
