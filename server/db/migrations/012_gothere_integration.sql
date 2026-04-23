-- GoThere integration: link each PBT route back to its authoritative record
-- on GoThere (either a one-off ride or a recurring ride series), and cache
-- the persistent 4-char collaborator code + public slug for cheap display.
--
-- Exactly one of (gothere_ride_id, gothere_series_id) is set per route:
--   - gothere_ride_id  set, gothere_series_id NULL  => one-off ride
--   - gothere_series_id set, gothere_ride_id NULL   => recurring ride series
--   - both NULL                                     => legacy / not yet linked
--
-- PBT remains the marketing surface (slug, hero, partner logos, description,
-- vanity URLs); GoThere owns the operational surface (broadcast, live position,
-- follower page, Commons publish).

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS gothere_ride_id           UUID,
  ADD COLUMN IF NOT EXISTS gothere_series_id         UUID,
  ADD COLUMN IF NOT EXISTS gothere_slug              VARCHAR(12),
  ADD COLUMN IF NOT EXISTS gothere_collaborator_code VARCHAR(4),
  -- One-off date (YYYY-MM-DD in the route's timezone). For recurring routes
  -- this will instead be populated via the recurrence/starts_on fields added
  -- in a later migration and stays NULL here.
  ADD COLUMN IF NOT EXISTS date                      DATE;

-- Enforce that a route is EITHER a one-off OR a series, never both.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'routes_gothere_kind_xor'
      AND table_name = 'routes'
  ) THEN
    ALTER TABLE routes ADD CONSTRAINT routes_gothere_kind_xor
      CHECK (gothere_ride_id IS NULL OR gothere_series_id IS NULL);
  END IF;
END $$;

-- Uniqueness where set (partial unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_gothere_ride_id
  ON routes(gothere_ride_id) WHERE gothere_ride_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_gothere_series_id
  ON routes(gothere_series_id) WHERE gothere_series_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_gothere_slug
  ON routes(gothere_slug) WHERE gothere_slug IS NOT NULL;

-- Non-unique lookup index on the collaborator code. Codes are unique on
-- GoThere's side; we do not enforce uniqueness locally because a deleted
-- route could orphan one and we don't want that to block a new series
-- reusing the same code.
CREATE INDEX IF NOT EXISTS idx_routes_gothere_collaborator_code
  ON routes(gothere_collaborator_code) WHERE gothere_collaborator_code IS NOT NULL;
