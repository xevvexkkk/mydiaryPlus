import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { pool } from '../db';

const router = Router();
router.use(authenticate);

// ── Configuration ──────────────────────────────────────────────────
const EXPORT_DIR = path.join(__dirname, '../../../storage/exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

const APP_VERSION = process.env.npm_package_version || '1.0.0';
const ATTACHMENT_STORAGE = path.join(__dirname, '../../../storage/attachments');
const UPLOADS_DIR = path.join(__dirname, '../../../uploads');

// Simple in-memory job store (for single-server deployments)
const jobs = new Map<string, {
  userId: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  progress: string;
  filePath?: string;
  createdAt: Date;
  error?: string;
}>();

// Cleanup old export files every hour
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      if (job.filePath) {
        try { fs.unlinkSync(job.filePath); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeExportName(name: string): string {
  const basename = path.basename(name.replace(/\\/g, '/'));
  const sanitized = basename.replace(/[\x00-\x1f\x7f/\\]/g, '_').trim();
  return sanitized || 'attachment';
}

/**
 * Resolve a regular file without allowing `..` or symlinks to escape its
 * storage root. Missing and unsafe files both abort the export so a package
 * can never be marked complete while silently omitting media.
 */
function resolveStoredFile(rootDir: string, relativePath: string, label: string): string {
  const rootPath = path.resolve(rootDir);
  const candidatePath = path.resolve(rootPath, relativePath);

  if (candidatePath === rootPath || !candidatePath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Unsafe ${label} path`);
  }

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(candidatePath);
  } catch {
    throw new Error(`Missing ${label} file`);
  }

  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Unsafe ${label} file type`);
  }

  const realRoot = fs.realpathSync(rootPath);
  const realCandidate = fs.realpathSync(candidatePath);
  if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Unsafe ${label} path`);
  }

  return realCandidate;
}

/**
 * Build URL → local path mapping by copying attachment files.
 * Returns a map of API URL → relative path from ZIP root.
 */
function buildUrlToLocal(
  attachments: any[],
  entries: any[],
  mediaDir: string,
): Record<string, string> {
  const urlToLocal: Record<string, string> = {};

  // Copy private attachments
  for (const att of attachments) {
    const srcPath = resolveStoredFile(
      ATTACHMENT_STORAGE,
      String(att.storage_key),
      `attachment ${att.id}`
    );
    const destName = `${att.id}-${safeExportName(String(att.original_name))}`;
    fs.copyFileSync(srcPath, path.join(mediaDir, destName));
    urlToLocal[`/api/attachments/${att.id}`] = `media/${destName}`;
  }

  // Copy legacy /uploads/ images referenced in diary content
  for (const entry of entries) {
    const uploadRefs = entry.content.match(/\/uploads\/[^\s)"']+/g) || [];
    for (const ref of uploadRefs) {
      const relativePath = ref.slice('/uploads/'.length);
      const srcPath = resolveStoredFile(UPLOADS_DIR, relativePath, 'legacy upload');
      const refHash = crypto.createHash('sha256').update(ref).digest('hex').slice(0, 12);
      const destName = `legacy-${refHash}-${safeExportName(relativePath)}`;
      fs.copyFileSync(srcPath, path.join(mediaDir, destName));
      urlToLocal[ref] = `media/${destName}`;
    }

    // Also handle images stored in the images JSONB array
    let images: string[] = [];
    try {
      images = typeof entry.images === 'string' ? JSON.parse(entry.images) : (entry.images || []);
    } catch { /* ignore */ }
    for (const imgUrl of images) {
      if (imgUrl.startsWith('/uploads/') && !urlToLocal[imgUrl]) {
        const relativePath = imgUrl.slice('/uploads/'.length);
        const srcPath = resolveStoredFile(UPLOADS_DIR, relativePath, 'legacy upload');
        const refHash = crypto.createHash('sha256').update(imgUrl).digest('hex').slice(0, 12);
        const destName = `legacy-${refHash}-${safeExportName(relativePath)}`;
        fs.copyFileSync(srcPath, path.join(mediaDir, destName));
        urlToLocal[imgUrl] = `media/${destName}`;
      }
    }
  }

  return urlToLocal;
}

/**
 * Rewrite image URLs in a text string using the URL mapping.
 */
function rewriteUrls(text: string, urlToLocal: Record<string, string>): string {
  let result = text;
  for (const [apiUrl, localPath] of Object.entries(urlToLocal)) {
    result = result.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(apiUrl)}\\)`, 'g'),
      `![$1](${localPath})`
    );
    result = result.replace(new RegExp(escapeRegex(apiUrl), 'g'), localPath);
  }
  return result;
}

// ── Start export job ───────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const jobId = crypto.randomUUID();
  const userId = req.user!.userId;

  jobs.set(jobId, {
    userId,
    status: 'pending',
    progress: 'Queued',
    createdAt: new Date(),
  });

  // Process asynchronously
  processExport(jobId, userId).catch(err => {
    console.error('Export job failed:', err);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.progress = 'Failed';
      job.error = err.message;
    }
  });

  res.status(202).json({ jobId, status: 'pending' });
});

// ── Check job status ───────────────────────────────────────────────
router.get('/:jobId', (req: AuthRequest, res: Response): void => {
  const jobId = String(req.params.jobId || '');
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found or expired' });
    return;
  }

  if (job.userId !== req.user!.userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json({
    jobId,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    error: job.error || undefined,
  });
});

// ── Download export file ───────────────────────────────────────────
router.get('/:jobId/download', (req: AuthRequest, res: Response): void => {
  const jobId = String(req.params.jobId || '');
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found or expired' });
    return;
  }

  if (job.userId !== req.user!.userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (job.status !== 'ready' || !job.filePath) {
    res.status(400).json({ error: 'Export is not ready yet' });
    return;
  }

  const filename = `mydiary-export-${new Date().toISOString().slice(0, 10)}.zip`;
  res.download(job.filePath, filename);
});

// ── Async export processor ─────────────────────────────────────────
async function processExport(jobId: string, userId: number): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';

  // 1. Fetch all diary entries
  job.progress = 'Fetching diary entries...';
  const { rows: entries } = await pool.query(
    `SELECT id, to_char(diary_date, 'YYYY-MM-DD') as date, content, mood_emoji, images, created_at, updated_at
     FROM tb_diaries
     WHERE user_id = $1
     ORDER BY diary_date ASC`,
    [userId]
  );

  // 2. Fetch all attachments
  job.progress = 'Fetching attachments...';
  const { rows: attachments } = await pool.query(
    `SELECT id, storage_key, original_name, mime_type, size_bytes, sha256, created_at
     FROM tb_attachments
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [userId]
  );

  job.progress = 'Building export package...';

  // 3. Create temporary directory structure
  const tmpDir = path.join(EXPORT_DIR, `tmp-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const markdownDir = path.join(tmpDir, 'markdown');
  const mediaDir = path.join(tmpDir, 'media');
  fs.mkdirSync(markdownDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });

  try {
    // 4. Build URL mapping FIRST (copy files, determine local paths)
    const urlToLocal = buildUrlToLocal(attachments, entries, mediaDir);

    // 5. Write entries.json (with rewritten image URLs)
    const entriesData = entries.map(e => {
      let content = rewriteUrls(e.content, urlToLocal);
      // Rewrite images array too
      let images: string[] = [];
      try {
        images = typeof e.images === 'string' ? JSON.parse(e.images) : (e.images || []);
      } catch { /* ignore */ }
      const rewrittenImages = images.map(img => urlToLocal[img] || img);

      return {
        id: e.id,
        date: e.date,
        content,
        mood_emoji: e.mood_emoji,
        images: rewrittenImages,
        created_at: e.created_at,
        updated_at: e.updated_at,
      };
    });
    fs.writeFileSync(
      path.join(tmpDir, 'entries.json'),
      JSON.stringify(entriesData, null, 2),
      'utf8'
    );

    // 6. Write markdown files (with correct relative paths to media/)
    for (const entry of entries) {
      const dateParts = entry.date.split('-');
      const mdDir = path.join(markdownDir, dateParts[0], dateParts[1]);
      fs.mkdirSync(mdDir, { recursive: true });

      // Compute relative path from markdown/YYYY/MM/ to media/
      // Depth: 3 directories (year, month, file) → prefix is "../../../"
      const relPrefix = '../../../';
      let mdContent = entry.content;
      for (const [apiUrl, localPath] of Object.entries(urlToLocal)) {
        const relPath = relPrefix + localPath;
        mdContent = mdContent.replace(
          new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(apiUrl)}\\)`, 'g'),
          `![$1](${relPath})`
        );
        mdContent = mdContent.replace(new RegExp(escapeRegex(apiUrl), 'g'), relPath);
      }

      const moodLine = entry.mood_emoji ? `> Mood: ${entry.mood_emoji}\n\n` : '';
      mdContent = `# ${entry.date}\n\n${moodLine}${mdContent}\n`;
      fs.writeFileSync(path.join(mdDir, `${entry.date}.md`), mdContent, 'utf8');
    }

    // 7. Write manifest.json
    const manifest = {
      formatVersion: 1,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      entryCount: entries.length,
      attachmentCount: attachments.length,
    };
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // 8. Generate checksums
    const checksums: string[] = [];
    for (const file of walkDir(tmpDir)) {
      const relativePath = path.relative(tmpDir, file);
      const data = fs.readFileSync(file);
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      checksums.push(`${hash}  ${relativePath}`);
    }
    fs.writeFileSync(path.join(tmpDir, 'checksums.sha256'), checksums.join('\n') + '\n', 'utf8');

    // 9. Create ZIP
    const zipPath = path.join(EXPORT_DIR, `${jobId}.zip`);
    await createZip(tmpDir, zipPath);

    // 10. Clean up temp dir and update job
    fs.rmSync(tmpDir, { recursive: true, force: true });

    job.status = 'ready';
    job.progress = 'Completed';
    job.filePath = zipPath;
  } catch (err) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw err;
  }
}

// ── Helper: walk directory recursively ─────────────────────────────
function* walkDir(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else {
      yield fullPath;
    }
  }
}

// ── Helper: create ZIP archive ─────────────────────────────────────
async function createZip(sourceDir: string, destPath: string): Promise<void> {
  const { execSync } = require('child_process');
  execSync(
    `cd "${sourceDir}" && zip -r "${destPath}" . -x ".*" -q`,
    { timeout: 300000 }
  );
}

export default router;
