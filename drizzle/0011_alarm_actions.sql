ALTER TABLE activity_sessions ADD COLUMN extension_seconds integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS alarm_action_receipts (
  id text PRIMARY KEY NOT NULL,
  profile_id text NOT NULL,
  activity_id text NOT NULL,
  action text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alarm_action_profile ON alarm_action_receipts (profile_id, created_at);
