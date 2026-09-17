import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { pool } from '../db';
import { ATTACHMENT_DIR } from '../attachmentUtils';

const router = Router();
router.use(authenticate);

// ── Download attachment (authenticated) ────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM tb_attachments WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    const attachment = rows[0];

    if (attachment.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const filePath = path.join(ATTACHMENT_DIR, attachment.storage_key);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000');
    res.type(attachment.mime_type);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Attachment download error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Delete attachment (soft delete) ────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      'SELECT user_id FROM tb_attachments WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    if (rows[0].user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await pool.query('UPDATE tb_attachments SET deleted_at = NOW() WHERE id = $1', [id]);
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    console.error('Attachment delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
