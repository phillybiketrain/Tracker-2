-- Mark routes as "Official PBT" so the homepage can filter to only those.
-- All existing routes default to false; admins opt in per route.

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_routes_is_official
  ON routes(is_official) WHERE is_official = true;
