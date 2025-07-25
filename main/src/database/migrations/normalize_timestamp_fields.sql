-- Convert TEXT timestamp fields to DATETIME for consistency
-- This migration converts last_viewed_at and run_started_at from TEXT to DATETIME

-- Step 1: Create new temporary columns with DATETIME type
ALTER TABLE sessions ADD COLUMN last_viewed_at_new DATETIME;
ALTER TABLE sessions ADD COLUMN run_started_at_new DATETIME;

-- Step 2: Copy and convert existing data
-- SQLite will automatically parse ISO 8601 strings to DATETIME
UPDATE sessions SET last_viewed_at_new = datetime(last_viewed_at) WHERE last_viewed_at IS NOT NULL;
UPDATE sessions SET run_started_at_new = datetime(run_started_at) WHERE run_started_at IS NOT NULL;

-- Step 3: Drop old columns
ALTER TABLE sessions DROP COLUMN last_viewed_at;
ALTER TABLE sessions DROP COLUMN run_started_at;

-- Step 4: Rename new columns to original names
ALTER TABLE sessions RENAME COLUMN last_viewed_at_new TO last_viewed_at;
ALTER TABLE sessions RENAME COLUMN run_started_at_new TO run_started_at;

-- Step 5: Add missing completion_timestamp field to prompt_markers table
ALTER TABLE prompt_markers ADD COLUMN completion_timestamp DATETIME;