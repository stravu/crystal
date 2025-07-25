-- Add favorite support to sessions
ALTER TABLE sessions ADD COLUMN is_favorite BOOLEAN DEFAULT 0;