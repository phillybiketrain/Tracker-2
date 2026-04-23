/**
 * GoThere API client.
 *
 * PBT acts as the "philly-bike-train" account on GoThere. A long-lived JWT
 * minted once for that account is kept in GOTHERE_SERVICE_TOKEN and sent as
 * a bearer token on every request. GoThere in turn publishes these rides to
 * Neighborhood Commons and mints the persistent 4-char collaborator codes
 * that ride leaders redeem in the GoThere app.
 *
 * This module stays intentionally thin: each export maps 1:1 to a GoThere
 * endpoint and either returns parsed JSON or throws {@link GoThereError}.
 * Business logic (when to create, when to publish, what to store locally)
 * lives in the PBT route handlers that call into this module.
 *
 * Required env vars (see .env.example):
 *   GOTHERE_API_URL         e.g. https://api.gothere.bike
 *   GOTHERE_SERVICE_TOKEN   long-lived JWT for the philly-bike-train account
 *   GOTHERE_PUBLIC_BASE     e.g. https://gothere.bike  (used to build follower URLs)
 */

import dotenv from 'dotenv';

dotenv.config();

const API_URL = (process.env.GOTHERE_API_URL || 'https://api.gothere.bike').replace(/\/+$/, '');
const SERVICE_TOKEN = process.env.GOTHERE_SERVICE_TOKEN || '';
const PUBLIC_BASE = (process.env.GOTHERE_PUBLIC_BASE || 'https://gothere.bike').replace(/\/+$/, '');

/**
 * Structured error surfaced by every client function on failure.
 * `status` is the HTTP status (undefined for network errors); `code` is
 * either GoThere's error.code payload or a synthetic like NETWORK_ERROR /
 * NOT_CONFIGURED.
 */
export class GoThereError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message);
    this.name = 'GoThereError';
    this.status = status;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * True if the service token is present. Callers can gate outbound calls on
 * this in development environments where GoThere isn't wired up.
 * @returns {boolean}
 */
export function isConfigured() {
  return Boolean(SERVICE_TOKEN);
}

/**
 * Build the public follower URL for a given ride or series slug.
 * @param {{ kind: 'ride' | 'series', slug: string }} ref
 * @returns {string}
 */
export function publicUrl({ kind, slug }) {
  return kind === 'series'
    ? `${PUBLIC_BASE}/series/${slug}`
    : `${PUBLIC_BASE}/${slug}`;
}

/**
 * Low-level request helper. All public methods funnel through here.
 * @param {string} method
 * @param {string} path
 * @param {{ json?: unknown, body?: BodyInit, headers?: Record<string,string>, expectJson?: boolean }} [opts]
 * @returns {Promise<any>}
 */
async function request(method, path, { json, body, headers = {}, expectJson = true } = {}) {
  if (!SERVICE_TOKEN) {
    throw new GoThereError('GOTHERE_SERVICE_TOKEN is not set', { code: 'NOT_CONFIGURED' });
  }

  const finalHeaders = {
    Authorization: `Bearer ${SERVICE_TOKEN}`,
    ...headers,
  };
  let finalBody = body;
  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(json);
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers: finalHeaders, body: finalBody });
  } catch (cause) {
    throw new GoThereError(`Network failure calling GoThere ${method} ${path}`, {
      code: 'NETWORK_ERROR',
      cause,
    });
  }

  if (!res.ok) {
    let payload;
    try { payload = await res.json(); } catch { /* body may not be JSON */ }
    const code = payload?.error?.code || `HTTP_${res.status}`;
    const message = payload?.error?.message || res.statusText || 'GoThere request failed';
    throw new GoThereError(`GoThere ${method} ${path} → ${res.status}: ${message}`, {
      status: res.status,
      code,
    });
  }

  if (!expectJson || res.status === 204) return null;
  return res.json();
}

/**
 * Wrap a GPX string as multipart/form-data matching GoThere's upload
 * expectation: a single `file` field with a `.gpx` filename.
 * @param {string} gpxXml
 * @returns {FormData}
 */
function gpxFormData(gpxXml) {
  const form = new FormData();
  const blob = new Blob([gpxXml], { type: 'application/gpx+xml' });
  form.append('file', blob, 'route.gpx');
  return form;
}

// ─── One-off rides ─────────────────────────────────────────────────────────

/**
 * @typedef {object} CreateRideInput
 * @property {string} name                1–200 chars
 * @property {string} startsAt            ISO-8601 with offset, e.g. "2026-05-07T18:00:00-04:00"
 * @property {string} timezone            IANA, e.g. "America/New_York"
 * @property {string} startLocationName
 * @property {string} [startAddress]
 * @property {number} [startLat]
 * @property {number} [startLng]
 * @property {string} [details]           ≤ 5000 chars
 */

/**
 * Create a draft ride owned by the philly-bike-train account.
 * @param {CreateRideInput} input
 * @returns {Promise<{ id: string, slug: string, status: 'draft' | 'published' }>}
 */
export async function createRide(input) {
  const res = await request('POST', '/rides', { json: input });
  return res.ride;
}

/**
 * Upload the GPX that defines this ride's route. GoThere's endpoint expects
 * multipart/form-data with a single `file` field whose original filename
 * ends in `.gpx`.
 *
 * @param {string} rideId
 * @param {string} gpxXml
 * @returns {Promise<{ ok: true, distanceM: number, pointCount: number }>}
 */
export function uploadRideRoute(rideId, gpxXml) {
  return request('POST', `/rides/${rideId}/route`, {
    body: gpxFormData(gpxXml),
  });
}

/**
 * Publish the ride to Neighborhood Commons. Ride must have a route attached.
 * @param {string} rideId
 * @returns {Promise<{ id: string, slug: string, status: 'published' }>}
 */
export async function publishRide(rideId) {
  const res = await request('POST', `/rides/${rideId}/publish`);
  return res.ride;
}

/**
 * Mint (or return the existing) 4-char collaborator code for a ride. Idempotent.
 * @param {string} rideId
 * @returns {Promise<{ code: string, expiresAt: string }>}
 */
export function mintRideCollaboratorCode(rideId) {
  return request('POST', `/rides/${rideId}/collaborator-code`);
}

/**
 * Delete a ride on GoThere. Cascades to Commons (the linked event is removed).
 * Used for saga-style rollback when a PBT create flow fails partway through.
 * @param {string} rideId
 */
export function deleteRide(rideId) {
  return request('DELETE', `/rides/${rideId}`, { expectJson: false });
}

// ─── Ride series (recurring) ───────────────────────────────────────────────

/**
 * @typedef {object} CreateSeriesInput
 * @property {string} name
 * @property {string} timezone
 * @property {string} startLocationName
 * @property {string} [startAddress]
 * @property {number} [startLat]
 * @property {number} [startLng]
 * @property {string} [details]
 * @property {string} recurrence           Commons internal format (e.g. "weekly", "biweekly", "weekly_days:mon,wed,fri")
 * @property {number} [instanceCount]      null/undefined = ongoing; Commons auto-extends
 * @property {string} startsOn             YYYY-MM-DD; first occurrence date
 * @property {string} departureTimeLocal   HH:MM in the series timezone
 */

/**
 * Create a draft recurring ride series owned by the philly-bike-train account.
 * @param {CreateSeriesInput} input
 * @returns {Promise<{ id: string, publicSlug: string, status: 'draft' | 'published' }>}
 */
export async function createSeries(input) {
  const res = await request('POST', '/ride-series', { json: input });
  return res.series;
}

/**
 * Upload the GPX that defines the shared route for every occurrence.
 * Same multipart contract as `uploadRideRoute`.
 *
 * @param {string} seriesId
 * @param {string} gpxXml
 * @returns {Promise<{ ok: true, distanceM: number, pointCount: number }>}
 */
export function uploadSeriesRoute(seriesId, gpxXml) {
  return request('POST', `/ride-series/${seriesId}/route`, {
    body: gpxFormData(gpxXml),
  });
}

/**
 * Publish the series to Commons — Commons materializes N instances.
 * @param {string} seriesId
 * @returns {Promise<{ id: string, publicSlug: string, status: 'published' }>}
 */
export async function publishSeries(seriesId) {
  const res = await request('POST', `/ride-series/${seriesId}/publish`);
  return res.series;
}

/**
 * Mint (or return the existing) persistent 4-char code for a series. Idempotent.
 * Same code works for every occurrence — this is the core leader-UX primitive.
 * @param {string} seriesId
 * @returns {Promise<{ code: string }>}
 */
export function mintSeriesCollaboratorCode(seriesId) {
  return request('POST', `/ride-series/${seriesId}/collaborator-code`);
}

/**
 * Delete a series on GoThere. Cascades to Commons (all occurrences removed).
 * Used for saga-style rollback.
 * @param {string} seriesId
 */
export function deleteSeries(seriesId) {
  return request('DELETE', `/ride-series/${seriesId}`, { expectJson: false });
}

// ─── Live data ─────────────────────────────────────────────────────────────

/**
 * Snapshot of all currently-broadcasting rides for a given account handle.
 * Used by the PBT marketing map to show all concurrent PBT rides at once.
 * Public endpoint on GoThere (no auth required), but we route through the
 * same client for consistency.
 *
 * @param {string} handle   e.g. "philly-bike-train"
 */
export function getAccountLiveSnapshot(handle) {
  return request('GET', `/public/accounts/${encodeURIComponent(handle)}/live`);
}

// ─── Diagnostics ───────────────────────────────────────────────────────────

/**
 * Cheap health check — returns the account behind the current service token.
 * Useful for a startup sanity check or an admin-dashboard widget.
 */
export function healthCheck() {
  return request('GET', '/me');
}
