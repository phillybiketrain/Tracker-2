-- Migration 007: Remove dead weight
-- Drops unused tables, orphaned columns, and the superseded region TEXT column.
-- Safe to run multiple times (all IF EXISTS).

-- Dead feature tables
DROP TABLE IF EXISTS route_suggestions;
DROP TABLE IF EXISTS ride_interest;
DROP TABLE IF EXISTS ride_followers;

-- Dead audit columns on routes (moderation workflow was never built)
ALTER TABLE routes DROP COLUMN IF EXISTS approved_at;
ALTER TABLE routes DROP COLUMN IF EXISTS approved_by;

-- Superseded by region_id (INTEGER FK to regions table added in 001_multi_region.sql)
ALTER TABLE routes DROP COLUMN IF EXISTS region;

-- Never populated
ALTER TABLE ride_instances DROP COLUMN IF EXISTS leader_session_id;
