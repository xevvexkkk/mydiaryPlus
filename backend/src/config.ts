import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Resolve a configuration value.
 *
 * Supports Docker Secrets convention: if `KEY_FILE` env var is set,
 * reads the value from that file path. Otherwise returns `KEY` env var.
 */
export function resolveSecret(key: string): string | undefined {
  const filePath = process.env[`${key}_FILE`];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      console.error(`❌ Failed to read secret file ${filePath} for ${key}:`, err);
      process.exit(1);
    }
  }
  return process.env[key];
}

/**
 * Get a required config value. Exits process if missing or placeholder.
 */
export function requireConfig(key: string, hint: string): string {
  const val = resolveSecret(key);
  if (
    !val ||
    val.startsWith('your_') ||
    val.startsWith('change_this') ||
    val.startsWith('change_me')
  ) {
    console.error(`❌ Missing or placeholder value for ${key}.`);
    console.error(`   ${hint}`);
    process.exit(1);
  }
  return val;
}

// ── Exported config values ─────────────────────────────────────────
export const JWT_SECRET = requireConfig(
  'JWT_SECRET',
  'Generate a strong random string (e.g. openssl rand -hex 64). Must be at least 32 characters.'
);

if (JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters long.');
  console.error('   Generate one with: openssl rand -hex 64');
  process.exit(1);
}

export const DB_PASSWORD = resolveSecret('DB_PASSWORD') || process.env.DB_PASSWORD || '';
export const COOKIE_SECRET = resolveSecret('COOKIE_SECRET') || JWT_SECRET;
