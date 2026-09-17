import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { pool } from '../db';
import {
  ATTACHMENT_DIR,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  generateStorageKey,
  validateMagicBytes,
  computeSha256,
} from '../attachmentUtils';

const router = Router();
router.use(authenticate);

// Ensure storage directory exists
if (!fs.existsSync(ATTACHMENT_DIR)) {
  fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
}

// ── Multer config ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACHMENT_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'tmp-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      cb(new Error(`File type ${ext} is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error(`MIME type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

// ── Upload image (private) ─────────────────────────────────────────
router.post('/image', (req: AuthRequest, res: Response): void => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum size is 20 MB.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No image provided' });
      return;
    }

    const tmpPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    try {
      if (!validateMagicBytes(tmpPath, req.file.mimetype)) {
        fs.unlinkSync(tmpPath);
        res.status(400).json({ error: 'File content does not match its declared type' });
        return;
      }

      const sha256 = computeSha256(tmpPath);
      const storageKey = generateStorageKey(ext);
      const fullDir = path.join(ATTACHMENT_DIR, path.dirname(storageKey));
      const fullPath = path.join(ATTACHMENT_DIR, storageKey);

      if (!fs.existsSync(fullDir)) {
        fs.mkdirSync(fullDir, { recursive: true });
      }
      fs.renameSync(tmpPath, fullPath);

      let attachmentId: string;
      try {
        const { rows } = await pool.query(
          `INSERT INTO tb_attachments (user_id, storage_key, original_name, mime_type, size_bytes, sha256)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [req.user!.userId, storageKey, req.file.originalname, req.file.mimetype, req.file.size, sha256]
        );
        attachmentId = rows[0].id;
      } catch (dbErr) {
        // DB insert failed — remove the moved file to avoid orphan
        try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
        throw dbErr;
      }

      res.json({ id: attachmentId, url: `/api/attachments/${attachmentId}` });
    } catch (error) {
      // Clean up tmp file only if it still exists (not yet renamed)
      try { fs.accessSync(tmpPath); fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      console.error('Upload processing error:', error);
      res.status(500).json({ error: 'Failed to process upload' });
    }
  });
});

export default router;
