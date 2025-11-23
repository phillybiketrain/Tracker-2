-- Add start_location_icon_url to routes table
-- Allows route creators to upload custom icons for the starting location

ALTER TABLE routes
ADD COLUMN start_location_icon_url TEXT;

COMMENT ON COLUMN routes.start_location_icon_url IS 'URL to custom icon image (PNG/JPG, max 1MB) displayed at route start location';
