-- Migration: Make exercises tenant-aware
-- Description: Add user_id, parent_exercise_id, and is_default columns to exercises table

-- Add new columns to exercises table
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES next_auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS parent_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Mark all existing exercises as default exercises
UPDATE exercises
SET is_default = TRUE
WHERE user_id IS NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercises_is_default ON exercises(is_default);

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON exercises;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON exercises;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON exercises;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON exercises;

-- Enable Row Level Security
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read default exercises OR their own exercises
CREATE POLICY "Users can read default and own exercises"
ON exercises FOR SELECT
USING (
  is_default = TRUE OR user_id = auth.uid()
);

-- RLS Policy: Users can only insert their own exercises
CREATE POLICY "Users can insert own exercises"
ON exercises FOR INSERT
WITH CHECK (user_id = auth.uid() AND is_default = FALSE);

-- RLS Policy: Users can only update their own exercises (not defaults)
CREATE POLICY "Users can update own exercises"
ON exercises FOR UPDATE
USING (user_id = auth.uid() AND is_default = FALSE)
WITH CHECK (user_id = auth.uid() AND is_default = FALSE);

-- RLS Policy: Users can only delete their own exercises (not defaults)
CREATE POLICY "Users can delete own exercises"
ON exercises FOR DELETE
USING (user_id = auth.uid() AND is_default = FALSE);

