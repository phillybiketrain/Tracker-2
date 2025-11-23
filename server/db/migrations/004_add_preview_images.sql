-- ============================================
-- ADD PREVIEW IMAGES
-- Add preview_image_url for cached map previews
-- ============================================

-- Add preview_image_url column to routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS preview_image_url TEXT;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_routes_preview_image ON routes(preview_image_url);
