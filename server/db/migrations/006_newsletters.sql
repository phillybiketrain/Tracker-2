-- Newsletter system for block-based email composer
-- Migration 006: newsletters table

CREATE TABLE IF NOT EXISTS newsletters (
  id                SERIAL PRIMARY KEY,
  region_id         INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,

  -- Metadata
  name              TEXT NOT NULL,                    -- Internal reference name
  subject           TEXT NOT NULL DEFAULT '',         -- Email subject line
  preheader         TEXT DEFAULT '',                  -- Preview text shown in email clients

  -- Content - array of block objects
  blocks            JSONB NOT NULL DEFAULT '[]',

  -- Status
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),

  -- Audit trail
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by        TEXT,                             -- Admin email
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_by        TEXT,

  -- Send tracking
  sent_at           TIMESTAMPTZ,
  recipient_count   INTEGER DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_newsletters_region ON newsletters(region_id);
CREATE INDEX IF NOT EXISTS idx_newsletters_status ON newsletters(status);
CREATE INDEX IF NOT EXISTS idx_newsletters_created ON newsletters(created_at DESC);

-- Comment describing block schema
COMMENT ON COLUMN newsletters.blocks IS 'JSON array of block objects: [{ id, type, data, settings }]. Types: header, text, upcoming_rides, photo, divider, footer';
