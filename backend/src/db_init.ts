import { Client } from 'pg';
import dotenv from 'dotenv';
import { DB_PASSWORD } from './config';

dotenv.config();

/**
 * 确保数据库已存在（不处理表结构，由 migrate.ts 负责）
 */
export const ensureDatabaseReady = async () => {
  const dbName = process.env.DB_NAME || 'mydiary';
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: DB_PASSWORD,
  };

  const adminClient = new Client({
    ...config,
    database: 'postgres',
  });

  try {
    console.log(`Connecting to PostgreSQL at ${config.host}:${config.port}...`);
    await adminClient.connect();

    const res = await adminClient.query(
      `SELECT datname FROM pg_catalog.pg_database WHERE datname = $1`,
      [dbName]
    );

    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" does not exist. Creating...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database "${dbName}" created successfully.`);
    } else {
      console.log(`✅ Database "${dbName}" already exists.`);
    }
  } catch (err) {
    console.error('❌ Failed to check/create database:', err);
    throw err;
  } finally {
    try {
      await adminClient.end();
    } catch (e) {
      // Ignore
    }
  }
};
