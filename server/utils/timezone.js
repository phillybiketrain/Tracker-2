/**
 * Timezone utilities.
 *
 * PBT stores departure_time as a naive TIME and (as of migration 012) date
 * as a naive DATE. GoThere's API wants ISO-8601 with UTC offset + an IANA
 * timezone name. This module bridges the two.
 *
 * Pure stdlib — uses Intl.DateTimeFormat with `timeZoneName: 'longOffset'`,
 * available in Node 18+. No new dependencies.
 */

/**
 * Combine a local date + time in a given IANA timezone into an ISO-8601 string
 * with offset that GoThere's Zod `z.string().datetime({ offset: true })` accepts.
 *
 * @example
 *   toIsoWithOffset('2026-07-15', '18:00', 'America/New_York')
 *   // → '2026-07-15T18:00:00-04:00'   (EDT)
 *   toIsoWithOffset('2026-01-15', '18:00', 'America/New_York')
 *   // → '2026-01-15T18:00:00-05:00'   (EST)
 *
 * @param {string} dateStr   YYYY-MM-DD
 * @param {string} timeStr   HH:MM or HH:MM:SS
 * @param {string} timezone  IANA, e.g. 'America/New_York'
 * @returns {string}
 */
export function toIsoWithOffset(dateStr, timeStr, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new TypeError(`Invalid dateStr: ${dateStr}`);
  }
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!timeMatch) {
    throw new TypeError(`Invalid timeStr: ${timeStr}`);
  }
  const [, hh, mm, ss = '00'] = timeMatch;

  // Two-pass algorithm to handle DST transitions correctly:
  //
  //   pass 1: treat the wall-clock time as if it were UTC and ask what offset
  //           the target tz has at that UTC instant. This is approximate —
  //           the "real" UTC instant is offset-hours away.
  //
  //   pass 2: shift by that offset to get the candidate real UTC instant,
  //           then re-read the tz offset there. On non-DST days this matches
  //           pass 1; across a DST boundary it gives the authoritative offset.
  const [y, mo, d] = dateStr.split('-').map(Number);
  const probe1 = new Date(Date.UTC(y, mo - 1, d, Number(hh), Number(mm), Number(ss)));
  const offset1 = offsetForInstant(probe1, timezone);
  const probe2 = new Date(probe1.getTime() - offsetToMs(offset1));
  const offset2 = offsetForInstant(probe2, timezone);

  return `${dateStr}T${hh}:${mm}:${ss}${offset2}`;
}

/**
 * Return the UTC offset that `timezone` has at the given instant, formatted
 * as `±HH:MM`.
 *
 * @param {Date} date
 * @param {string} timezone
 * @returns {string}
 */
function offsetForInstant(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  // longOffset produces "GMT+HH:MM" or "GMT-HH:MM"; normalize edge shapes.
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name);
  if (!m) return '+00:00';
  const sign = m[1];
  const hh = m[2].padStart(2, '0');
  const mm = (m[3] || '00').padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/**
 * Convert a `±HH:MM` offset string to milliseconds east of UTC.
 * @param {string} offsetStr
 * @returns {number}
 */
function offsetToMs(offsetStr) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offsetStr);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60 * 1000;
}
