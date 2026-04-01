CREATE TABLE IF NOT EXISTS app.evaluation_forms (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT REFERENCES app.activities(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(1000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_forms_activity_id ON app.evaluation_forms(activity_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_forms_is_active ON app.evaluation_forms(is_active);

CREATE TABLE IF NOT EXISTS app.evaluation_questions (
  id BIGSERIAL PRIMARY KEY,
  form_id BIGINT NOT NULL REFERENCES app.evaluation_forms(id) ON DELETE CASCADE,
  prompt VARCHAR(300) NOT NULL,
  response_type VARCHAR(32) NOT NULL CHECK (response_type IN ('numeric_scale', 'comment')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INTEGER NOT NULL,
  min_value SMALLINT,
  max_value SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (order_index > 0),
  CHECK (
    (response_type = 'numeric_scale' AND min_value = 1 AND max_value = 5)
    OR
    (response_type = 'comment' AND min_value IS NULL AND max_value IS NULL)
  ),
  UNIQUE (form_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_questions_form_id ON app.evaluation_questions(form_id);

CREATE TABLE IF NOT EXISTS app.evaluation_submissions (
  id BIGSERIAL PRIMARY KEY,
  form_id BIGINT NOT NULL REFERENCES app.evaluation_forms(id) ON DELETE RESTRICT,
  submitted_by_user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  receipt_id VARCHAR(64) NOT NULL UNIQUE,
  answers JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_submissions_form_id ON app.evaluation_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_submissions_user_id ON app.evaluation_submissions(submitted_by_user_id);
