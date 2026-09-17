import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { ensureDatabaseReady } from './db_init';
import { runMigrations } from './migrate';
import { startSessionCleanup } from './session';

const port = process.env.PORT || 3000;

const startServer = async () => {
  try {
    console.log('🔄 Initializing database...');
    await ensureDatabaseReady();

    console.log('🔄 Running database migrations...');
    await runMigrations();

    // Start background session cleanup
    startSessionCleanup();

    app.listen(port, () => {
      console.log(`✅ Backend Server is running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ Failed to start application:', err);
    process.exit(1);
  }
};

startServer();
