import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { validateSession, SessionUser } from '../session';

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';

export interface AuthRequest extends Request {
  user?: SessionUser;
}

/**
 * Authenticate using session cookie.
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const rawToken = req.signedCookies?.session;
  if (!rawToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await validateSession(rawToken);
  if (!user) {
    res.clearCookie('session');
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  req.user = user;
  next();
};

/**
 * Optional auth — attaches user if session exists, continues regardless.
 */
export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
  const rawToken = req.signedCookies?.session;
  if (rawToken) {
    const user = await validateSession(rawToken);
    if (user) req.user = user;
  }
  next();
};

/**
 * CSRF protection for state-changing requests.
 * Validates X-CSRF-Token header against XSRF-TOKEN cookie.
 */
export const csrfProtection = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
};

/**
 * Generate and set a CSRF token cookie (readable by JS).
 */
export function setCsrfCookie(res: Response): void {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,   // Must be readable by frontend JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}
