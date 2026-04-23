/**
 * Migrate pre-existing PBT routes to Go There (local CLI version).
 *
 * The easier path is the /admin/migrate admin page — it runs on the
 * deployed server where the Railway Postgres is already reachable and
 * doesn't need local env at all. This script exists for environments
 * where you have direct DB access and want to migrate in bulk without
 * clicking through a UI.
 *
 * Migration logic itself lives in server/services/route-migration.js so
 * both entry points (script + admin endpoint) behave identically.
 *
 * Usage:
 *   1. Fill in ROUTES_TO_MIGRATE below.
 *   2. Dry-run: node server/scripts/migrate-routes-to-gothere.js --dry-run
 *   3. Execute: node server/scripts/migrate-routes-to-gothere.js
 *
 * Requires the same .env as the PBT server: DATABASE_URL + GOTHERE_*.
 */

import { closePool } from '../db/client.js';
import * as gothere from '../services/gothere.js';
import { migrateRoute } from '../services/route-migration.js';

// ─────────────────────────────────────────────────────────────────────────
// EDIT THIS: one entry per pre-existing route to migrate.
//
// Fields:
//   accessCode         The existing 4-char PBT access code (stays unchanged).
//   recurrence         'weekly' | 'biweekly' | 'monthly' | null
//                        null = one-off; otherwise Commons internal format.
//                        For weekly/biweekly the day-of-week is derived from
//                        `date`; for monthly the day-of-month is derived.
//   date               First-occurrence date (YYYY-MM-DD).
//   instanceCount      Optional cap for bounded series (1–260). Omit for
//                        ongoing — Commons auto-extends.
// ─────────────────────────────────────────────────────────────────────────

/** @type {Array<import('../services/route-migration.js').MigrateRouteInput>} */
const ROUTES_TO_MIGRATE = [
  // { accessCode: 'XMKP', recurrence: 'biweekly', date: '2026-05-07' },
  // { accessCode: 'ABCD', recurrence: 'weekly',   date: '2026-05-06' },
  // { accessCode: 'EFGH', recurrence: null,       date: '2026-06-01' }, // one-off
];

// ─────────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (ROUTES_TO_MIGRATE.length === 0) {
    console.error('❌ ROUTES_TO_MIGRATE is empty. Edit this file or use /admin/migrate instead.');
    process.exit(1);
  }
  if (!gothere.isConfigured() && !DRY_RUN) {
    console.error('❌ GOTHERE_SERVICE_TOKEN is not set. Add it to .env before running (or use --dry-run).');
    process.exit(1);
  }

  console.log(`\n🚴 Migrating ${ROUTES_TO_MIGRATE.length} route(s) to Go There${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const results = [];
  for (const entry of ROUTES_TO_MIGRATE) {
    const r = await migrateRoute(entry, { dryRun: DRY_RUN });
    results.push(r);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Migration summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of results) {
    const icon = r.status === 'migrated' ? '✅'
      : r.status === 'skipped'  ? '⏭️ '
      : r.status === 'dry-run'  ? '🔍'
      :                           '❌';
    console.log(`${icon} ${r.accessCode.padEnd(6)} ${r.status.padEnd(10)} ${r.detail ?? ''}`);
  }
  console.log('');
  await closePool();
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err);
  closePool().finally(() => process.exit(1));
});
