-- Drop estimated_duration column (unused, doesn't pull its weight)
ALTER TABLE routes DROP COLUMN IF EXISTS estimated_duration;
