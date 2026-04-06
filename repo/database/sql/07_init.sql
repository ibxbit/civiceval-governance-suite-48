CREATE TABLE IF NOT EXISTS app.system_health (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL
);

INSERT INTO app.system_health (status)
VALUES ('initialized');

\getenv enable_seed_admin ENABLE_SEED_ADMIN
\getenv seed_admin_password_hash SEED_ADMIN_PASSWORD_HASH

\if :{?enable_seed_admin}
\if :enable_seed_admin
\if :{?seed_admin_password_hash}
INSERT INTO app.users (username, password_hash, role)
VALUES (
  'admin',
  :'seed_admin_password_hash',
  'admin'
)
ON CONFLICT (username)
DO UPDATE SET
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();
\else
\echo 'ENABLE_SEED_ADMIN=true but SEED_ADMIN_PASSWORD_HASH is missing. Admin seed skipped.'
\endif
\endif
\endif
