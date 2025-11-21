/**
 * Database Setup Script
 * Creates the bike_train database and enables PostGIS extension
 * Run with: npm run db:setup
 */

import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;

// Load environment variables
dotenv.config();

// Extract password from DATABASE_URL
const dbUrl = new URL(process.env.DATABASE_URL);
const password = dbUrl.password;

async function setupDatabase() {
  console.log('🔧 Setting up database...\n');

  // Connect to postgres database (default) to create our database
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: password,
    database: 'postgres'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check if database exists
    const checkDb = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'bike_train'"
    );

    if (checkDb.rows.length === 0) {
      // Create database
      await client.query('CREATE DATABASE bike_train');
      console.log('✅ Created database: bike_train');
    } else {
      console.log('ℹ️  Database bike_train already exists');
    }

    await client.end();

    // Connect to bike_train database to enable PostGIS
    const bikeTrainClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: password,
      database: 'bike_train'
    });

    await bikeTrainClient.connect();

    // Enable PostGIS extension
    await bikeTrainClient.query('CREATE EXTENSION IF NOT EXISTS postgis');
    console.log('✅ Enabled PostGIS extension');

    // Verify PostGIS
    const version = await bikeTrainClient.query('SELECT PostGIS_Version()');
    console.log(`✅ PostGIS version: ${version.rows[0].postgis_version}`);

    await bikeTrainClient.end();

    console.log('\n🎉 Database setup complete!');
    console.log('Next step: Run "npm run db:migrate" to create tables');

  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    process.exit(1);
  }
}

setupDatabase();
