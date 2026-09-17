CREATE TABLE IF NOT EXISTS tb_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tb_diaries (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES tb_users(id) ON DELETE CASCADE,
    diary_date DATE NOT NULL,
    content TEXT NOT NULL,
    mood_emoji VARCHAR(10),
    images JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, diary_date)
);
