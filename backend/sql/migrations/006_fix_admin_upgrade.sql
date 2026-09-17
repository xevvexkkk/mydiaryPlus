-- Upgrade path for databases created before session-based auth:
-- If no admin exists and there are users, make the first user an admin
-- This handles the case where old databases had users without is_admin set

DO $$
BEGIN
  -- Only act if no admin exists but users do
  IF NOT EXISTS (SELECT 1 FROM tb_users WHERE is_admin = true) AND EXISTS (SELECT 1 FROM tb_users) THEN
    -- Make the earliest-registered user the admin
    UPDATE tb_users SET is_admin = true WHERE id = (SELECT id FROM tb_users ORDER BY created_at ASC LIMIT 1);

    -- Close registration if it was never set
    INSERT INTO tb_app_settings (key, value, updated_at)
    VALUES ('registration_open', 'false', NOW())
    ON CONFLICT (key) DO NOTHING;
  END IF;

  -- If registration_open was never set but admins exist, default to closed
  IF EXISTS (SELECT 1 FROM tb_users WHERE is_admin = true) THEN
    INSERT INTO tb_app_settings (key, value, updated_at)
    VALUES ('registration_open', 'false', NOW())
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
