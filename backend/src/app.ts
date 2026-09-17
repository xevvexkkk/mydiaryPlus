import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import diaryRoutes from './routes/diaries';
import uploadRoutes from './routes/upload';
import attachmentRoutes from './routes/attachments';
import exportRoutes from './routes/exports';
import path from 'path';
import { pool } from './db';
import fs from 'fs';
import { authenticate, csrfProtection, setCsrfCookie } from './middleware/auth';

const app = express();

// ── Security headers ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  },
}));

// ── Body parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Cookie parser (signed) ─────────────────────────────────────────
import { COOKIE_SECRET } from './config';
app.use(cookieParser(COOKIE_SECRET));

// ── CORS ───────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : undefined;

app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}));

// ── Upload directory static hosting (authenticated) ────────────────
app.use('/uploads', authenticate, express.static(path.join(__dirname, '../../uploads')));

// ── CSRF token endpoint ────────────────────────────────────────────
app.get('/api/csrf-token', (req, res) => {
  setCsrfCookie(res);
  res.json({ message: 'CSRF cookie set' });
});

// ── Routes ─────────────────────────────────────────────────────────
// Auth routes: CSRF applied per-route in auth.ts (login/register are exempt)
app.use('/api/auth', authRoutes);
app.use('/api/diaries', csrfProtection, diaryRoutes);
app.use('/api/upload', csrfProtection, uploadRoutes);
app.use('/api/attachments', csrfProtection, attachmentRoutes);
app.use('/api/exports', csrfProtection, exportRoutes);

// ── Health Checks ──────────────────────────────────────────────────
app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health/ready', async (_req, res) => {
  try {
    // Database connectivity
    await pool.query('SELECT 1');

    // Migration status
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS applied FROM schema_migrations'
    );

    // Attachments directory writable
    const attachmentDir = path.join(__dirname, '../../storage/attachments');
    if (!fs.existsSync(attachmentDir)) {
      fs.mkdirSync(attachmentDir, { recursive: true });
    }
    fs.accessSync(attachmentDir, fs.constants.W_OK);

    // Disk space check (only on non-Windows)
    let diskSpaceOk = true;
    try {
      const { execSync } = require('child_process');
      const df = execSync('df -k ' + JSON.stringify(attachmentDir), { timeout: 3000 }).toString();
      // Parse available blocks; warn if less than 100 MB
      const lines = df.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        const availKB = parseInt(parts[3], 10);
        if (availKB < 102400) diskSpaceOk = false; // < 100 MB
      }
    } catch {
      // df not available (Windows), skip check
    }

    if (!diskSpaceOk) {
      res.status(503).json({
        status: 'error',
        message: 'Low disk space',
        database: 'connected',
        migrationsApplied: rows[0]?.applied || 0,
        uploadsWritable: true,
        diskSpaceOk: false,
      });
      return;
    }

    res.json({
      status: 'ok',
      database: 'connected',
      migrationsApplied: rows[0]?.applied || 0,
      uploadsWritable: true,
      diskSpaceOk: diskSpaceOk,
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      message: 'Service not ready',
    });
  }
});

// Legacy health endpoint (redirect to live)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// =============================================
// 生产打包环境：让后端接管前端 Vue3 构建的页面
// =============================================
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }
  // 放行后端自身所有核心 API 与 uploads 的静态拉取 
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  // 其余任意页面（包括刷新），强制定向到 Vue 客户端软路由
  res.sendFile(path.join(frontendDist, 'index.html'));
});

export default app;
