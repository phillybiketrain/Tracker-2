/**
 * Admin HTTP endpoints for the one-shot Go There migration.
 *
 * Runs inside the deployed PBT server where Postgres and the GoThere
 * service token are already available, so the operator doesn't need to
 * wrestle with Railway DB access from a laptop. Triggered from the
 * /admin/migrate UI page, but also callable directly via curl.
 *
 * Endpoints:
 *   GET  /api/admin/migration/unmigrated   → list unmigrated routes
 *   POST /api/admin/migration/migrate      → execute migration for a batch
 *
 * Both require admin auth via the standard Authorization: Bearer <token>
 * header issued by POST /api/admin/login.
 */

import express from 'express';
import { z } from 'zod';
import { requireAdmin } from './admin.js';
import * as gothere from '../services/gothere.js';
import { migrateRoute, listUnmigratedRoutes, refreshSlugs } from '../services/route-migration.js';

const router = express.Router();

/**
 * GET /api/admin/migration/unmigrated
 * Lists approved routes that haven't been linked to Go There yet, with a
 * small amount of context (recent dates) to help the operator guess the
 * recurrence pattern.
 */
router.get('/unmigrated', requireAdmin, async (req, res) => {
  try {
    const routes = await listUnmigratedRoutes();
    res.json({
      success: true,
      data: routes,
      gothere_configured: gothere.isConfigured(),
    });
  } catch (error) {
    console.error('❌ Error listing unmigrated routes:', error);
    res.status(500).json({
      error: 'Failed to list unmigrated routes',
      message: error.message,
    });
  }
});

const MigrateBatchSchema = z.object({
  dryRun: z.boolean().optional(),
  routes: z.array(z.object({
    accessCode: z.string().regex(/^[A-Z0-9]{4}$/),
    recurrence: z.enum(['weekly', 'biweekly', 'monthly']).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    instanceCount: z.number().int().min(1).max(260).optional(),
  })).min(1).max(50),
});

/**
 * POST /api/admin/migration/migrate
 * Runs migrateRoute() for each entry in the batch, returning per-route
 * results. Each entry is independent — one failing doesn't abort the rest.
 */
router.post('/migrate', requireAdmin, async (req, res) => {
  try {
    const parsed = MigrateBatchSchema.parse(req.body);

    if (!parsed.dryRun && !gothere.isConfigured()) {
      return res.status(412).json({
        error: 'Upstream not configured',
        message: 'GOTHERE_SERVICE_TOKEN is not set in the server environment.',
      });
    }

    const results = [];
    for (const entry of parsed.routes) {
      const r = await migrateRoute(entry, { dryRun: !!parsed.dryRun });
      results.push(r);
    }

    const summary = results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      `📦 Migration batch by ${req.admin.email || 'super-admin'}: ${
        JSON.stringify(summary)
      }`
    );

    res.json({ success: true, summary, results });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('❌ Error running migration batch:', error);
    res.status(500).json({
      error: 'Migration failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/migration/refresh-slugs
 *
 * One-shot endpoint that consumes Go There's `/admin/reslug-series`
 * response verbatim and updates `routes.gothere_slug` to whatever Go
 * There's series now hold. Match-by-id (gothere_series_id ↔ seriesId).
 * Series that exist in the response but not locally are reported as
 * `no_local_row` and skipped — no error, just logged.
 */
const RefreshSlugsSchema = z.object({
  // `migrated` is informational from Go There's side; we don't validate it.
  migrated: z.number().int().optional(),
  results: z.array(z.object({
    seriesId: z.string().uuid(),
    oldSlug: z.string().optional(),
    // 6-char [a-z2-9] is Go There's post-redesign series slug shape.
    newSlug: z.string().regex(/^[a-z2-9]{6}$/, '6-char [a-z2-9] expected'),
    commonsUpdated: z.boolean().optional(),
  })).min(1).max(100),
});

router.post('/refresh-slugs', requireAdmin, async (req, res) => {
  try {
    const parsed = RefreshSlugsSchema.parse(req.body);
    const result = await refreshSlugs(parsed);
    console.log(
      `📦 Slug refresh by ${req.admin.email || 'super-admin'}: ${
        result.updated
      } updated, ${result.results.length - result.updated} no-op`
    );
    res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    console.error('❌ Slug refresh failed:', err);
    res.status(500).json({
      error: 'Slug refresh failed',
      message: err.message,
    });
  }
});

export default router;
