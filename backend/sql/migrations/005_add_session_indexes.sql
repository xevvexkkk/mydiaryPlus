-- Periodic cleanup of expired sessions (run via cron or migration)
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON tb_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON tb_sessions(user_id);
