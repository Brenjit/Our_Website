-- Goals feature migration
CREATE TABLE IF NOT EXISTS goals (
  id text PRIMARY KEY NOT NULL,
  profile_id text NOT NULL,
  title text NOT NULL,
  target_minutes integer NOT NULL DEFAULT 60,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_profile ON goals (profile_id);
ALTER TABLE tasks ADD COLUMN goal_id text;
