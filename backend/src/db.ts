import { Pool } from 'pg';
import dotenv from 'dotenv';
import { DB_PASSWORD } from './config';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: DB_PASSWORD,
  database: process.env.DB_NAME,
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};
