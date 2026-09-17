import crypto from 'crypto';
import { pool } from './db';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  userId: number;
  username: string;
  isAdmin: boolean;
}

/**
 * Create a new session for a user and return the raw token to set as cookie.
 */
export async function createSession(user: SessionUser): Promise<string> {
  const rawToken = crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await pool.query(
    `INSERT INTO tb_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.userId, tokenHash, expiresAt]
  );

  return rawToken;
}

/**
 * Validate a session token from cookie. Returns session user or null.
 */
export async function validateSession(rawToken: string | undefined): Promise<SessionUser | null> {
  if (!rawToken) return null;

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { rows } = await pool.query(
    `SELECT s.user_id, u.username, u.is_admin
     FROM tb_sessions s
     JOIN tb_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()`,
    [tokenHash]
  );

  if (rows.length === 0) return null;

  // Update last_used_at
  await pool.query(
    'UPDATE tb_sessions SET last_used_at = NOW() WHERE token_hash = $1',
    [tokenHash]
  );

  return {
    userId: rows[0].user_id,
    username: rows[0].username,
    isAdmin: rows[0].is_admin,
  };
}

/**
 * Revoke a specific session (logout).
 */
export async function revokeSession(rawToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await pool.query(
    'UPDATE tb_sessions SET revoked_at = NOW() WHERE token_hash = $1',
    [tokenHash]
  );
}

/**
 * Revoke all sessions for a user except the current one.
 */
export async function revokeOtherSessions(userId: number, currentToken: string): Promise<void> {
  const currentHash = crypto.createHash('sha256').update(currentToken).digest('hex');
  await pool.query(
    `UPDATE tb_sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND token_hash != $2 AND revoked_at IS NULL`,
    [userId, currentHash]
  );
}

/**
 * Check if any admin user exists.
 */
export async function hasAnyAdmin(): Promise<boolean> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM tb_users WHERE is_admin = true');
  return rows[0].cnt > 0;
}

/**
 * Get or set app settings.
 */
export async function getAppSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT value FROM tb_app_settings WHERE key = $1', [key]);
  return rows.length > 0 ? rows[0].value : null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO tb_app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

/**
 * Periodically clean up expired sessions.
 */
export function startSessionCleanup(): void {
  const cleanup = async () => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM tb_sessions WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`
      );
      if (rowCount && rowCount > 0) {
        console.log(`🧹 Cleaned up ${rowCount} expired/revoked sessions.`);
      }
    } catch (err) {
      console.error('Session cleanup error:', err);
    }
  };

  // Run immediately on startup, then every hour
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();
}
