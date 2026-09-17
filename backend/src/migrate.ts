import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from './db';

export async function runMigrations(): Promise<void> {
  // 1. Ensure schema_migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(10) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Read migration files sorted by version
  const migrationsDir = path.join(__dirname, '../sql/migrations');
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir)
      .filter(f => /^\d+_.+\.sql$/.test(f))
      .sort();
  } catch {
    console.warn('⚠️  No migrations directory found, skipping.');
    return;
  }

  if (files.length === 0) {
    console.log('ℹ️  No pending migrations.');
    return;
  }

  // 3. Get already applied migrations
  const { rows: applied } = await pool.query(
    'SELECT version, checksum FROM schema_migrations ORDER BY version'
  );
  const appliedMap = new Map<string, string>(
    applied.map((r: any) => [r.version, r.checksum])
  );

  // 4. Apply pending migrations in order
  for (const file of files) {
    const version = file.split('_')[0] || '';

    if (appliedMap.has(version)) {
      // Verify checksum hasn't changed (detect tampering)
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const storedChecksum = appliedMap.get(version);
      if (storedChecksum && storedChecksum !== checksum) {
        console.error(`❌ Migration ${file} has been modified since it was applied!`);
        console.error(`   Expected checksum: ${storedChecksum}`);
        console.error(`   Actual checksum:   ${checksum}`);
        process.exit(1);
      }
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [version, file.replace('.sql', ''), checksum]
      );
      await client.query('COMMIT');
      console.log(`✅ Migration ${file} applied.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration ${file} failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}
