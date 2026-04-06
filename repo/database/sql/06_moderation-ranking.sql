CREATE TABLE IF NOT EXISTS app.comments (
  id BIGSERIAL PRIMARY KEY,
  content_id BIGINT,
  body TEXT NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'approved', 'blocked')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  moderated_by_user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  moderation_note VARCHAR(500),
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_status ON app.comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_pinned ON app.comments(pinned);

CREATE TABLE IF NOT EXISTS app.comment_reports (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES app.comments(id) ON DELETE CASCADE,
  reason VARCHAR(300) NOT NULL,
  details VARCHAR(1000),
  status VARCHAR(16) NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  handled_by_user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  resolution_note VARCHAR(500),
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON app.comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_status ON app.comment_reports(status);

CREATE TABLE IF NOT EXISTS app.qna_entries (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT REFERENCES app.activities(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'approved', 'blocked')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  moderated_by_user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  moderation_note VARCHAR(500),
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qna_entries_status ON app.qna_entries(status);
CREATE INDEX IF NOT EXISTS idx_qna_entries_pinned ON app.qna_entries(pinned);

CREATE TABLE IF NOT EXISTS app.qna_reports (
  id BIGSERIAL PRIMARY KEY,
  qna_id BIGINT NOT NULL REFERENCES app.qna_entries(id) ON DELETE CASCADE,
  reason VARCHAR(300) NOT NULL,
  details VARCHAR(1000),
  status VARCHAR(16) NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  handled_by_user_id BIGINT REFERENCES app.users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  resolution_note VARCHAR(500),
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qna_reports_qna_id ON app.qna_reports(qna_id);
CREATE INDEX IF NOT EXISTS idx_qna_reports_status ON app.qna_reports(status);

CREATE TABLE IF NOT EXISTS app.rankings (
  id BIGSERIAL PRIMARY KEY,
  subject_key VARCHAR(120) NOT NULL,
  benchmark_value NUMERIC(6,3) NOT NULL CHECK (benchmark_value >= 0 AND benchmark_value <= 100),
  price_value NUMERIC(6,3) NOT NULL CHECK (price_value >= 0 AND price_value <= 100),
  volatility_value NUMERIC(6,3) NOT NULL CHECK (volatility_value >= 0 AND volatility_value <= 100),
  benchmark_weight NUMERIC(6,3) NOT NULL CHECK (benchmark_weight >= 0 AND benchmark_weight <= 100),
  price_weight NUMERIC(6,3) NOT NULL CHECK (price_weight >= 0 AND price_weight <= 100),
  volatility_weight NUMERIC(6,3) NOT NULL CHECK (volatility_weight >= 0 AND volatility_weight <= 100),
  score NUMERIC(6,3) NOT NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((benchmark_weight + price_weight + volatility_weight) = 100)
);

CREATE INDEX IF NOT EXISTS idx_rankings_subject_key_created_at ON app.rankings(subject_key, created_at DESC);
