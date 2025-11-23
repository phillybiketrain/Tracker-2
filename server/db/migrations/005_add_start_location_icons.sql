-- Add start_location_icon_url to routes table
-- Allows route creators to upload custom icons for the starting location

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routes' AND column_name = 'start_location_icon_url'
  ) THEN
    ALTER TABLE routes ADD COLUMN start_location_icon_url TEXT;
    COMMENT ON COLUMN routes.start_location_icon_url IS 'URL to custom icon image (PNG/JPG, max 1MB) displayed at route start location';
  END IF;
END $$;
