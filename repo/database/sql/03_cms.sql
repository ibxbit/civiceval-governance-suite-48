CREATE TABLE IF NOT EXISTS app.cms_files (
  id BIGSERIAL PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  extension VARCHAR(20) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 262144000),
  sha256_hash CHAR(64) NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  uploaded_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sha256_hash, size_bytes)
);

CREATE INDEX IF NOT EXISTS idx_cms_files_uploaded_by ON app.cms_files(uploaded_by_user_id);

CREATE TABLE IF NOT EXISTS app.cms_content (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  rich_text TEXT NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'published')),
  file_ids BIGINT[] NOT NULL DEFAULT '{}',
  version_number INTEGER NOT NULL DEFAULT 1,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  updated_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (version_number > 0)
);

CREATE INDEX IF NOT EXISTS idx_cms_content_status ON app.cms_content(status);

CREATE TABLE IF NOT EXISTS app.cms_content_versions (
  id BIGSERIAL PRIMARY KEY,
  content_id BIGINT NOT NULL REFERENCES app.cms_content(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  rich_text TEXT NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'published')),
  file_ids BIGINT[] NOT NULL DEFAULT '{}',
  action VARCHAR(16) NOT NULL CHECK (action IN ('create', 'update', 'publish', 'rollback')),
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cms_content_versions_content_id ON app.cms_content_versions(content_id);
