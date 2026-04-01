CREATE TABLE IF NOT EXISTS app.analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('page_view', 'dwell', 'read_complete', 'search', 'search_click')),
  page_path VARCHAR(500) NOT NULL,
  user_id BIGINT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  content_id BIGINT,
  referrer VARCHAR(500),
  dwell_ms INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (event_type <> 'dwell' AND dwell_ms IS NULL)
    OR
    (event_type = 'dwell' AND dwell_ms IS NOT NULL AND dwell_ms >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON app.analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON app.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON app.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_content_id ON app.analytics_events(content_id);
