-- Add distance_miles column to routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_miles DECIMAL(5,1);
