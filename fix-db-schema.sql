-- Fix missing columns in core.repositories table
-- Run this if you get "column does not exist" errors

-- Add analyzed_at column
ALTER TABLE core.repositories 
ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE;

-- Add extraction_status column
ALTER TABLE core.repositories 
ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(50) DEFAULT 'pending';

-- Add primary_language column
ALTER TABLE core.repositories 
ADD COLUMN IF NOT EXISTS primary_language VARCHAR(50) DEFAULT 'unknown';

-- Update existing records
UPDATE core.repositories 
SET analyzed_at = updated_at 
WHERE analyzed_at IS NULL;

UPDATE core.repositories 
SET extraction_status = CASE 
    WHEN sync_status = 'completed' THEN 'completed'
    WHEN sync_status = 'failed' THEN 'failed'
    ELSE 'pending'
END
WHERE extraction_status IS NULL OR extraction_status = 'pending';

-- Verify the changes
SELECT 
    name, 
    sync_status, 
    extraction_status, 
    primary_language,
    analyzed_at 
FROM core.repositories;

