import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db';
import {
  createSession,
  revokeSession,
  revokeOtherSessions,
} from '../session';
import { authenticate, AuthRequest, setCsrfCookie, csrfProtection } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// ── Login rate limiter: 10 attempts per 15 min per IP ─────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── Registration ───────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  try {
    // Fast fail for the normal closed-registration state. The authoritative
    // check is repeated under the transaction lock below.
    const { rows: registrationRows } = await pool.query(
      `SELECT
         EXISTS(SELECT 1 FROM tb_users WHERE is_admin = true) AS admin_exists,
         (SELECT value FROM tb_app_settings WHERE key = 'registration_open') AS registration_open`
    );
    if (
      registrationRows[0].admin_exists === true &&
      registrationRows[0].registration_open !== 'true'
    ) {
      res.status(403).json({ error: 'Registration is closed' });
      return;
    }

    // Hash before opening the transaction so bcrypt does not hold the
    // registration lock while doing CPU-intensive work.
    const hash = await bcrypt.hash(password, 10);

    let userId: number;
    let finalUsername: string;
    let finalIsAdmin: boolean;
    let willBeAdmin = false;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Serialize every registration decision. Without this lock, two
      // concurrent first requests could both promote themselves to admin.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('mydiary:registration'))`
      );

      const { rows: adminRows } = await client.query(
        `SELECT EXISTS(
           SELECT 1 FROM tb_users WHERE is_admin = true
         ) AS exists`
      );
      const adminExists = adminRows[0].exists === true;

      if (adminExists) {
        const { rows: settingRows } = await client.query(
          `SELECT value
           FROM tb_app_settings
           WHERE key = 'registration_open'`
        );

        // Fail closed: once an admin exists, registration is permitted only
        // when the setting is present and explicitly enabled.
        if (settingRows.length === 0 || settingRows[0].value !== 'true') {
          await client.query('ROLLBACK');
          res.status(403).json({ error: 'Registration is closed' });
          return;
        }
      }

      const userCheck = await client.query(
        'SELECT id FROM tb_users WHERE username = $1',
        [username]
      );
      if (userCheck.rowCount && userCheck.rowCount > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      willBeAdmin = !adminExists;
      const result = await client.query(
        'INSERT INTO tb_users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin',
        [username, hash, willBeAdmin]
      );

      userId = result.rows[0].id;
      finalUsername = result.rows[0].username;
      finalIsAdmin = result.rows[0].is_admin;

      if (willBeAdmin) {
        await client.query(
          `INSERT INTO tb_app_settings (key, value, updated_at)
           VALUES ('registration_open', 'false', NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Auto-create session for the new user
    const rawToken = await createSession({
      userId,
      username: finalUsername,
      isAdmin: finalIsAdmin,
    });

    // Set session cookie
    res.cookie('session', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      signed: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Set CSRF cookie
    setCsrfCookie(res);

    console.log(`✅ New user registered: ${finalUsername}${willBeAdmin ? ' (admin)' : ''}`);

    res.status(201).json({
      user: { id: userId, username: finalUsername, isAdmin: finalIsAdmin },
      message: willBeAdmin ? 'First user registered as admin. Registration is now closed.' : undefined,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Login ──────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM tb_users WHERE username = $1', [username]);
    if (!result.rowCount || result.rowCount === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const rawToken = await createSession({
      userId: user.id,
      username: user.username,
      isAdmin: user.is_admin,
    });

    // Set session cookie
    res.cookie('session', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      signed: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Set CSRF cookie
    setCsrfCookie(res);

    res.json({
      user: { id: user.id, username: user.username, isAdmin: user.is_admin },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Logout (CSRF protected) ────────────────────────────────────────
router.post('/logout', csrfProtection, authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const rawToken = req.signedCookies?.session;
  if (rawToken) {
    await revokeSession(rawToken);
  }

  res.clearCookie('session', { path: '/' });
  res.clearCookie('XSRF-TOKEN', { path: '/' });
  res.json({ message: 'Logged out' });
});

// ── Current user info ──────────────────────────────────────────────
router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user });
});

// ── Change password (CSRF protected) ───────────────────────────────
router.post('/change-password', csrfProtection, authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }

  try {
    const { rows } = await pool.query('SELECT password_hash FROM tb_users WHERE id = $1', [req.user!.userId]);
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE tb_users SET password_hash = $1 WHERE id = $2', [newHash, req.user!.userId]);

    // Revoke all other sessions
    const rawToken = req.signedCookies?.session;
    if (rawToken) {
      await revokeOtherSessions(req.user!.userId, rawToken);
    }

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
