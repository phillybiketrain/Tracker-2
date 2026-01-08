/**
 * Database Client
 * Simple wrapper around pg for querying PostgreSQL
 */

import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config();

// Create connection pool
// Sized for concurrent broadcasts - each ride:start does 2-5 queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30, // Increased for concurrent broadcasts (was 20)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased timeout (was 2000ms)
});

// Track pool health for debugging
let poolStats = { acquired: 0, released: 0, errors: 0 };

pool.on('acquire', () => { poolStats.acquired++; });
pool.on('release', () => { poolStats.released++; });
pool.on('error', () => { poolStats.errors++; });

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 100ms)
    if (duration > 100) {
      console.warn(`⚠️  Slow query (${duration}ms):`, text.substring(0, 100));
    }

    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    console.error('Query:', text);
    throw error;
  }
}

/**
 * Execute a query and return first row
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} First row or null
 */
export async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/**
 * Execute a query and return all rows
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of rows
 */
export async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Close all database connections
 */
export async function closePool() {
  await pool.end();
  console.log('Database pool closed');
}

/**
 * Get pool statistics for health monitoring
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    ...poolStats
  };
}

export default { query, queryOne, queryAll, closePool, getPoolStats };
