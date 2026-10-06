import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
});

// Simple query - uses pool.query() which auto-acquires and releases
export async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows;
}

export default pool;
