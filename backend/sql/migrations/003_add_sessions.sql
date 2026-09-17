-- Add session-based auth tables
CREATE TABLE IF NOT EXISTS tb_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INT NOT NULL REFERENCES tb_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP
);

-- Add admin flag to users
ALTER TABLE tb_users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- App-level settings (key-value)
CREATE TABLE IF NOT EXISTS tb_app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
