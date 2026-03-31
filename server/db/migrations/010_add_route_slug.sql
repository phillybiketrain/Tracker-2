-- Add vanity URL slug to routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_routes_slug ON routes (slug) WHERE slug IS NOT NULL;
