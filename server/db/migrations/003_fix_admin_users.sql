-- ============================================
-- FIX ADMIN_USERS TABLE
-- Add id column and restructure
-- ============================================

-- Add id column as SERIAL
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS id SERIAL;

-- Create unique constraint on email if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_users_email_key'
  ) THEN
    ALTER TABLE admin_users ADD CONSTRAINT admin_users_email_key UNIQUE (email);
  END IF;
END $$;

-- Note: We keep email as PRIMARY KEY for backward compatibility
-- The id column will be used for new features
