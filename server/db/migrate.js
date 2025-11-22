/**
 * Database Migration Script
 * Runs the schema.sql file and migration files
 * Run with: npm run db:migrate
 */

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const { Client } = pg;

// Load environment variables
dotenv.config();

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema
    await client.query(schema);
    console.log('✅ Schema executed successfully');

    // Run migration files if they exist
    const migrationsDir = join(__dirname, 'migrations');
    if (existsSync(migrationsDir)) {
      const files = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      if (files.length > 0) {
        console.log('\n🔄 Running migration files...');
        for (const file of files) {
          const filePath = join(migrationsDir, file);
          const sql = readFileSync(filePath, 'utf-8');
          await client.query(sql);
          console.log(`✅ ${file} executed`);
        }
      }
    }

    // Verify tables created
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📋 Created tables:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    await client.end();

    console.log('\n🎉 Migration complete!');
    console.log('Next step: Run "npm install" to install dependencies');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigrations();
