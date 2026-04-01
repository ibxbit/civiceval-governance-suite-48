ALTER TABLE app.auth_login_events
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_auth_login_events_reviewed_at
  ON app.auth_login_events(reviewed_at);
