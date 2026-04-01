CREATE TABLE IF NOT EXISTS app.system_health (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL
);

INSERT INTO app.system_health (status)
VALUES ('initialized');

INSERT INTO app.users (username, password_hash, role)
VALUES (
  'admin',
  'scrypt$16384$8$1$e9kjmTHz9Lr5mT87vFdxUg$JUU3EEUuNAJ-TyTc8_JfueTe4R-aWnOyhE5guOiCE0p2zx9ZIwoH76oyn5vFaePMkL3VPZ8QaMKfUGlEl2ZF9g',
  'admin'
)
ON CONFLICT (username)
DO UPDATE SET
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();
