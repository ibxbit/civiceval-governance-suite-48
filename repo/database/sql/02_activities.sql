CREATE TABLE IF NOT EXISTS app.activities (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  participation_type VARCHAR(16) NOT NULL CHECK (participation_type IN ('individual', 'team')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  registration_start_at TIMESTAMPTZ NOT NULL,
  registration_end_at TIMESTAMPTZ NOT NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (starts_at < ends_at),
  CHECK (registration_start_at < registration_end_at),
  CHECK (registration_end_at <= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_activities_starts_at ON app.activities(starts_at);
CREATE INDEX IF NOT EXISTS idx_activities_deleted_at ON app.activities(deleted_at);

CREATE TABLE IF NOT EXISTS app.activity_registrations (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT NOT NULL REFERENCES app.activities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_registrations_activity_id ON app.activity_registrations(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_registrations_user_id ON app.activity_registrations(user_id);

CREATE TABLE IF NOT EXISTS app.activity_checkin_codes (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT NOT NULL REFERENCES app.activities(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  used_by_user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_checkin_codes_lookup ON app.activity_checkin_codes(activity_id, code_hash);
CREATE INDEX IF NOT EXISTS idx_activity_checkin_codes_expires_at ON app.activity_checkin_codes(expires_at);

CREATE TABLE IF NOT EXISTS app.activity_checkins (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT NOT NULL REFERENCES app.activities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  checkin_code_id BIGINT NOT NULL REFERENCES app.activity_checkin_codes(id) ON DELETE RESTRICT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_checkins_activity_id ON app.activity_checkins(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_checkins_user_id ON app.activity_checkins(user_id);
