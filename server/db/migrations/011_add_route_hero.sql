-- Add hero JSONB column for rich event landing pages
-- Structure: { partner_name, partner_logo_url, start_label, end_label,
--              meet_time, roll_time, arrive_time, callout }
ALTER TABLE routes ADD COLUMN IF NOT EXISTS hero JSONB;
