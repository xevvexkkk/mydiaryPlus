import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ── Attachment storage configuration ───────────────────────────────
export const ATTACHMENT_DIR = path.join(__dirname, '../../storage/attachments');

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38])],
};

// Ensure storage directory exists
if (!fs.existsSync(ATTACHMENT_DIR)) {
  fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
}

/**
 * Generate a layered storage key like "ab/cd/uuid.ext"
 */
export function generateStorageKey(ext: string): string {
  const uuid = crypto.randomUUID();
  const prefix = uuid.substring(0, 2);
  const subPrefix = uuid.substring(2, 4);
  return `${prefix}/${subPrefix}/${uuid}${ext}`;
}

/**
 * Validate file content matches its declared MIME type using magic bytes.
 */
export function validateMagicBytes(filePath: string, mimeType: string): boolean {
  const magicList = MAGIC_BYTES[mimeType];
  if (!magicList) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return magicList.some(magic => buf.subarray(0, magic.length).equals(magic));
  } catch {
    return false;
  }
}

/**
 * Compute SHA-256 hash of a file.
 */
export function computeSha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}
