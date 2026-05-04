-- Daily session logs for continuity across Claude sessions.
CREATE TABLE IF NOT EXISTS daily_logs (
  date        TEXT PRIMARY KEY,   -- ISO date 'YYYY-MM-DD'
  summary     TEXT NOT NULL,
  model       TEXT,
  token_count INTEGER
);
