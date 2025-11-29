/**
 * Backfill route distances
 * Calculates and updates distance_miles for all existing routes
 * Run with: node server/db/backfill-distances.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { calculateRouteDistance } from '../utils/geo.js';

const { Client } = pg;

// Load environment variables
dotenv.config();

async function backfillDistances() {
  console.log('🔄 Backfilling route distances...\n');

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get all routes without distance
    const routes = await client.query(`
      SELECT id, name, waypoints
      FROM routes
      WHERE distance_miles IS NULL
    `);

    console.log(`📋 Found ${routes.rows.length} routes to update\n`);

    let updated = 0;
    for (const route of routes.rows) {
      const waypoints = route.waypoints;

      if (waypoints && waypoints.length >= 2) {
        const distance = calculateRouteDistance(waypoints);

        await client.query(`
          UPDATE routes
          SET distance_miles = $1
          WHERE id = $2
        `, [distance, route.id]);

        console.log(`✅ ${route.name}: ${distance} miles`);
        updated++;
      } else {
        console.log(`⚠️  ${route.name}: Skipped (not enough waypoints)`);
      }
    }

    await client.end();

    console.log(`\n🎉 Updated ${updated} routes with distance data!`);

  } catch (error) {
    console.error('❌ Backfill failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

backfillDistances();
