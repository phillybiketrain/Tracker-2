/**
 * Next-occurrence computation for PBT routes.
 *
 * Recurrence on a PBT route is stored in Commons' internal format (shared
 * verbatim with Go There): 'daily' | 'weekly' | 'biweekly' | 'monthly' (or
 * null for a one-off). `routes.date` is the first-occurrence date in the
 * series' timezone; `departure_time` is the local time-of-day. This module
 * walks those forward to whichever occurrence is next at-or-after `now`,
 * with no dependency on the legacy `ride_instances` table.
 *
 * The more expressive Commons patterns (`ordinal_weekday:N:DAY`,
 * `weekly_days:d1,d2,...`) are supported at the Commons / Go There layer
 * but PBT's own creation UI doesn't produce them today — if we ever
 * encounter one, we throw so the caller can fall back to whatever default
 * makes sense rather than silently misbehaving.
 */

import { toIsoWithOffset } from './timezone.js';

/**
 * @param {Date} now
 * @param {{
 *   recurrence: 'daily'|'weekly'|'biweekly'|'monthly'|null,
 *   firstDate: string,        // YYYY-MM-DD
 *   departureTime: string,    // HH:MM or HH:MM:SS
 *   timezone: string,         // IANA
 * }} opts
 * @returns {{ date: string, startsAt: Date } | null}
 *   - one-off + future firstDate → that one date
 *   - one-off + past firstDate → null
 *   - recurring → next occurrence at-or-after `now`
 *   - recurring but no future occurrence within the iteration bound → null
 */
export function nextOccurrence(now, { recurrence, firstDate, departureTime, timezone }) {
  if (!firstDate) return null;

  if (!recurrence) {
    const startsAt = new Date(toIsoWithOffset(firstDate, shortTime(departureTime), timezone));
    return startsAt >= now ? { date: firstDate, startsAt } : null;
  }

  // Iterative walk. Bound is generous — even daily at ~10 years = 3650
  // iterations, each of which is ~microseconds. Keeps the implementation
  // trivial vs. a closed-form fast-forward that has to second-guess DST.
  const MAX_ITERATIONS = 5000;
  let cursor = firstDate;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const startsAt = new Date(toIsoWithOffset(cursor, shortTime(departureTime), timezone));
    if (startsAt >= now) return { date: cursor, startsAt };
    cursor = advanceDate(cursor, recurrence);
  }
  return null;
}

/**
 * Human-readable recurrence string for UI. Matches the tone of Go There's
 * own humanizer so the two surfaces read the same.
 * @param {string | null} recurrence
 * @returns {string | null}
 */
export function humanizeRecurrence(recurrence) {
  switch (recurrence) {
    case null:
    case undefined: return null;
    case 'daily':    return 'Every day';
    case 'weekly':   return 'Every week';
    case 'biweekly': return 'Every other week';
    case 'monthly':  return 'Every month';
    default:         return 'Recurring';
  }
}

/**
 * Normalize HH:MM:SS → HH:MM so Postgres TIME round-trips cleanly into
 * the timezone helper, which accepts either form but is tidier with HH:MM.
 * @param {string} t
 */
function shortTime(t) {
  return t && t.length > 5 ? t.slice(0, 5) : t;
}

/**
 * Advance a YYYY-MM-DD by one recurrence period. UTC-based so the math
 * doesn't wander across DST — the tz-aware `startsAt` is recomputed in
 * the caller via toIsoWithOffset, which handles the DST adjustment.
 * @param {string} ymd
 * @param {string} recurrence
 */
function advanceDate(ymd, recurrence) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  switch (recurrence) {
    case 'daily':    dt.setUTCDate(dt.getUTCDate() + 1); break;
    case 'weekly':   dt.setUTCDate(dt.getUTCDate() + 7); break;
    case 'biweekly': dt.setUTCDate(dt.getUTCDate() + 14); break;
    case 'monthly':  dt.setUTCMonth(dt.getUTCMonth() + 1); break;
    default:
      throw new TypeError(`Unsupported recurrence for PBT-side computation: ${recurrence}`);
  }
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
