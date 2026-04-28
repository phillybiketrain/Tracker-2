/**
 * Build the public Go There follower URL for a given slug.
 *
 * Go There's recent series-URL redesign collapsed `/series/<slug>` to bare
 * `/<slug>` — both rides and series now resolve at the root, with a 6-char
 * `[a-z2-9]` slug. Once every local row has been refreshed via
 * `/admin/migrate` → "Refresh Go There slugs", every slug we hold is 6 chars.
 *
 * In the meantime, any row that still holds the legacy 12-char slug needs
 * to go through Go There's back-compat `/series/<slug>` route, which 302s
 * to whatever the series's current short slug is on Go There's side. We
 * detect this by length — anything not 6 chars is treated as legacy.
 *
 * Once the refresh has run for every linked route, this fallback branch is
 * never taken and the function effectively becomes
 * ``${BASE}/${slug}``. It's safe to delete the fallback at that point.
 *
 * @param {string} slug
 * @returns {string}
 */
export function goThereFollowerUrl(slug) {
  const base = 'https://gothere.bike';
  if (!slug) return base;
  return slug.length === 6
    ? `${base}/${slug}`
    : `${base}/series/${slug}`;
}
