-- Migration 008: Drop location_trail column and orphaned Postgres function
-- location_trail is no longer written to (removed in 007/simplify pass)
-- cleanup_expired_suggestions() referenced route_suggestions which was dropped in 007

ALTER TABLE ride_instances DROP COLUMN IF EXISTS location_trail;

DROP FUNCTION IF EXISTS cleanup_expired_suggestions();
