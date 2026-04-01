CREATE TABLE IF NOT EXISTS app.users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'participant' CHECK (role IN ('admin', 'program_owner', 'reviewer', 'participant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_id UUID NOT NULL UNIQUE,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON app.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON app.sessions(expires_at);

CREATE TABLE IF NOT EXISTS app.login_attempts (
  username VARCHAR(32) PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app.login_devices (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  device_fingerprint CHAR(64) NOT NULL,
  user_agent TEXT,
  ip_address VARCHAR(80),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_fingerprint)
);

CREATE TABLE IF NOT EXISTS app.auth_login_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  username VARCHAR(32) NOT NULL,
  success BOOLEAN NOT NULL,
  device_fingerprint CHAR(64),
  user_agent TEXT,
  ip_address VARCHAR(80),
  is_unrecognized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_events_created_at ON app.auth_login_events(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_login_events_unrecognized ON app.auth_login_events(is_unrecognized);
