-- Philly Bike Train Database Schema
-- Clean, simplified design for fixed-route bike transit

-- ============================================
-- ROUTES (Fixed paths with departure times)
-- ============================================
CREATE TABLE IF NOT EXISTS routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code     TEXT UNIQUE NOT NULL,

  -- Core attributes
  name            TEXT NOT NULL,
  description     TEXT,
  waypoints       JSONB NOT NULL,           -- GeoJSON LineString
  departure_time  TIME NOT NULL,            -- e.g., 08:00
  estimated_duration INTERVAL,              -- e.g., '45 minutes'
  distance_miles  DECIMAL(5,1),             -- Calculated route distance in miles

  -- Metadata
  creator_email   TEXT,
  region          TEXT DEFAULT 'philly',
  status          TEXT DEFAULT 'pending',   -- pending | approved | archived

  -- Audit
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  approved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_routes_access_code ON routes(access_code);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
CREATE INDEX IF NOT EXISTS idx_routes_region ON routes(region);

-- ============================================
-- RIDE_INSTANCES (Specific dates for routes)
-- ============================================
CREATE TABLE IF NOT EXISTS ride_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id          UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,

  date              DATE NOT NULL,
  status            TEXT DEFAULT 'scheduled', -- scheduled | live | completed | cancelled

  -- Live tracking (populated when status = 'live')
  leader_session_id TEXT,
  current_location  JSONB,                    -- {lat, lng, timestamp}
  location_trail    JSONB DEFAULT '[]',       -- Array of {lat, lng, timestamp}
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,

  UNIQUE(route_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ride_instances_date ON ride_instances(date);
CREATE INDEX IF NOT EXISTS idx_ride_instances_status ON ride_instances(status);
CREATE INDEX IF NOT EXISTS idx_ride_instances_route ON ride_instances(route_id);

-- ============================================
-- FOLLOWERS (Who's watching a live ride)
-- ============================================
CREATE TABLE IF NOT EXISTS ride_followers (
  ride_instance_id  UUID NOT NULL REFERENCES ride_instances(id) ON DELETE CASCADE,
  session_id        TEXT NOT NULL,
  joined_at         TIMESTAMPTZ DEFAULT NOW(),
  last_seen         TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (ride_instance_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_followers_ride ON ride_followers(ride_instance_id);

-- ============================================
-- INTEREST (Who's interested in scheduled rides)
-- ============================================
CREATE TABLE IF NOT EXISTS ride_interest (
  ride_instance_id  UUID NOT NULL REFERENCES ride_instances(id) ON DELETE CASCADE,
  session_id        TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (ride_instance_id, session_id)
);

-- ============================================
-- EMAIL_SUBSCRIBERS (Weekly digests)
-- ============================================
CREATE TABLE IF NOT EXISTS email_subscribers (
  email              TEXT PRIMARY KEY,
  frequency          TEXT DEFAULT 'weekly',
  unsubscribe_token  TEXT UNIQUE NOT NULL,
  subscribed_at      TIMESTAMPTZ DEFAULT NOW(),
  last_email_sent    TIMESTAMPTZ
);

-- ============================================
-- ROUTE_SUGGESTIONS (Demand heatmap)
-- ============================================
CREATE TABLE IF NOT EXISTS route_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_lat         REAL NOT NULL,
  start_lng         REAL NOT NULL,
  end_lat           REAL NOT NULL,
  end_lng           REAL NOT NULL,
  start_address     TEXT,
  end_address       TEXT,
  preferred_times   TEXT[],                  -- ['morning', 'afternoon', 'evening']
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
);

CREATE INDEX IF NOT EXISTS idx_suggestions_expires ON route_suggestions(expires_at);

-- ============================================
-- ADMIN_USERS (Simple admin authentication)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
  email             TEXT PRIMARY KEY,
  password_hash     TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SEED DATA (Default admin)
-- ============================================

-- Insert default admin (password: admin123)
-- You should change this after first login!
INSERT INTO admin_users (email, password_hash)
VALUES ('admin@phillybiketrain.org', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7T90O5XsBq')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to clean up expired suggestions
CREATE OR REPLACE FUNCTION cleanup_expired_suggestions()
RETURNS void AS $$
BEGIN
  DELETE FROM route_suggestions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to generate random 4-letter access code
CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude similar chars (I,1,O,0)
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
