-- Recurring rides (Batch 3).
--
-- A PBT route is either a one-off (date set, recurrence NULL,
-- gothere_ride_id set) or a recurring series (date set = first occurrence,
-- recurrence set, gothere_series_id set). The mutex between gothere_ride_id
-- and gothere_series_id is already enforced by migration 012; this migration
-- adds the recurrence knobs.
--
-- `recurrence` is stored verbatim in Neighborhood Commons' internal format
-- so there is no translation layer on either side. The CHECK regex is a
-- superset-free copy of what Commons accepts at its own API boundary.
--
-- `instance_count` NULL means "ongoing" — Commons auto-extends the series
-- on a rolling 6-week horizon.

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS recurrence     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS instance_count INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'routes_recurrence_format'
      AND table_name = 'routes'
  ) THEN
    ALTER TABLE routes ADD CONSTRAINT routes_recurrence_format
      CHECK (
        recurrence IS NULL
        OR recurrence ~ '^(daily|weekly|biweekly|monthly|ordinal_weekday:[1-5]:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly_days:(mon|tue|wed|thu|fri|sat|sun)(,(mon|tue|wed|thu|fri|sat|sun))*)$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'routes_instance_count_range'
      AND table_name = 'routes'
  ) THEN
    ALTER TABLE routes ADD CONSTRAINT routes_instance_count_range
      CHECK (instance_count IS NULL OR (instance_count BETWEEN 1 AND 260));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_routes_recurrence
  ON routes(recurrence) WHERE recurrence IS NOT NULL;
