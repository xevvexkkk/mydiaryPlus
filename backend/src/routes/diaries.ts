import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// 获取月度日历概览数据 (格式: YYYY-MM)
router.get('/month/:yearMonth', async (req: AuthRequest, res: Response): Promise<void> => {
  const yearMonth = String(req.params.yearMonth || '');
  const userId = req.user?.userId;
  
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    res.status(400).json({ error: 'Invalid format. Use YYYY-MM' });
    return;
  }

  try {
    const result = await query(
      `SELECT to_char(diary_date, 'YYYY-MM-DD') as date, mood_emoji 
       FROM tb_diaries 
       WHERE user_id = $1 AND to_char(diary_date, 'YYYY-MM') = $2
       ORDER BY diary_date ASC`,
      [userId, yearMonth]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch month error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 日记内容检索
router.get('/search', async (req: AuthRequest, res: Response): Promise<void> => {
  const q = req.query.q as string;
  const userId = req.user?.userId;
  const searchPattern = q ? `%${q}%` : '%';
  
  try {
    const result = await query(
      `SELECT id, to_char(diary_date, 'YYYY-MM-DD') as date, content, mood_emoji, images, created_at, updated_at 
       FROM tb_diaries 
       WHERE user_id = $1 AND content ILIKE $2
       ORDER BY diary_date DESC`,
      [userId, searchPattern]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 按日期倒序分页获取时间线，供首页滚动加载历史记录
router.get('/timeline', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const requestedLimit = Number.parseInt(String(req.query.limit || '8'), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 30) : 8;

  if (before && !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    res.status(400).json({ error: 'Invalid before cursor. Use YYYY-MM-DD' });
    return;
  }

  try {
    const params: any[] = [userId];
    const cursorClause = before ? `AND diary_date < $2` : '';
    if (before) params.push(before);
    params.push(limit + 1);
    const limitPlaceholder = `$${params.length}`;

    const result = await query(
      `SELECT id, to_char(diary_date, 'YYYY-MM-DD') AS date, content,
              mood_emoji, images, created_at, updated_at
       FROM tb_diaries
       WHERE user_id = $1 ${cursorClause}
       ORDER BY diary_date DESC
       LIMIT ${limitPlaceholder}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    res.json({
      items,
      nextCursor: hasMore ? items[items.length - 1].date : null,
    });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取某一天的日记详细
router.get('/:date', async (req: AuthRequest, res: Response): Promise<void> => {
  const { date } = req.params;
  const userId = req.user?.userId;
  
  try {
    const result = await query(
      `SELECT id, to_char(diary_date, 'YYYY-MM-DD') as date, content, mood_emoji, images, created_at, updated_at 
       FROM tb_diaries 
       WHERE user_id = $1 AND diary_date = $2`,
      [userId, date]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Diary not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch date error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 保存或覆盖日记 (Upsert)
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date, content, mood_emoji, images } = req.body;
    const userId = req.user?.userId;
    const imagesJson = JSON.stringify(images || []);
    const result = await query(
      `INSERT INTO tb_diaries (user_id, diary_date, content, mood_emoji, images, updated_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, diary_date) 
       DO UPDATE SET content = EXCLUDED.content, mood_emoji = EXCLUDED.mood_emoji, images = EXCLUDED.images, updated_at = CURRENT_TIMESTAMP
       RETURNING id, to_char(diary_date, 'YYYY-MM-DD') as date, content, mood_emoji, images`,
      [userId, date, content, mood_emoji, imagesJson]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Save diary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
