-- Add private attachments table
CREATE TABLE IF NOT EXISTS tb_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INT NOT NULL REFERENCES tb_users(id) ON DELETE CASCADE,
    diary_id INT REFERENCES tb_diaries(id) ON DELETE SET NULL,
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON tb_attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_diary_id ON tb_attachments(diary_id);
