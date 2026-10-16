// COPIED VERBATIM from 3c-knock-logic src/lib/geocode.ts at commit f289f43
// (/home/fazetwerpnerd69/dev/3c-knock-logic/src/lib/geocode.ts). Do not edit here: change it in the
// app repo and copy it again. The Census geocoder sends no CORS headers, so the portal calls this
// from its server only (leadImportServer.ts), never from the browser.

/**
 * Forward geocoding for lead imports (LOGIC_REQUESTS #34): street addresses -> map points with the
 * free US Census batch geocoder (no key, US / Puerto Rico / Island Areas only). The store's
 * `previewLeadImport` and scripts/import-leads.ts call it between `leadGeocodeRequests` and
 * `planLeadImport` (leadImport.ts); the portal can copy both files.
 *
 * Census API (https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html, checked
 * 2026-10-16): POST multipart/form-data to /geocoder/locations/addressbatch with `benchmark`
 * (Public_AR_Current) and `addressFile` (CSV rows "Unique ID, Street address, City, State, ZIP",
 * at most 10,000 per file). The answer is CSV, one row per input: id, input address, Match /
 * No_Match / Tie, Exact / Non_Exact, matched address, "lon,lat", TIGER line id, side.
 *
 * The multipart body is built as a string, so this works the same with React Native's fetch, Node
 * and the browser (no FormData / Blob / file needed). The geocoder sends no CORS headers: a web
 * page (the portal) must call it from its server, not the browser.
 */
import { parseCsv, type LeadGeocodeRequest, type LeadPoint } from './leadImport.ts';

export const CENSUS_BATCH_URL = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
/** The Census limit per file. */
export const CENSUS_BATCH_MAX = 10_000;
/** Addresses per request: ~11 s each at the Census today, so several run side by side. */
const CHUNK = 1_000;
const CONCURRENCY = 4;
/** Per request; a chunk that times out or fails is tried once more. */
const TIMEOUT_MS = 90_000;

export type GeocodeResult =
  | {
      ok: true;
      /** Points by request key; addresses the geocoder couldn't place (No_Match, Tie) are missing. */
      points: Map<string, LeadPoint>;
    }
  | { ok: false; reason: 'unreachable' };

export interface GeocodeOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Addresses per request (at most CENSUS_BATCH_MAX). */
  chunkSize?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Called after each request with the addresses done so far and the total. */
  onProgress?: (done: number, total: number) => void;
}

/** One CSV field, quoted (commas, quotes and newlines are safe). */
function csvField(s: string): string {
  return `"${s.replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`;
}

/** The multipart/form-data body the Census batch endpoint takes, and its content type. */
export function censusBatchBody(requests: readonly LeadGeocodeRequest[], ids: readonly string[]): { body: string; contentType: string } {
  const boundary = `----3cDoorsGeocode${ids.length}x${Math.random().toString(36).slice(2)}`;
  const csv = requests.map((r, i) => [ids[i], r.street, r.city, r.state, r.zip].map(csvField).join(',')).join('\r\n');
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="benchmark"',
    '',
    'Public_AR_Current',
    `--${boundary}`,
    'Content-Disposition: form-data; name="addressFile"; filename="addresses.csv"',
    'Content-Type: text/csv',
    '',
    csv,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Parses a Census batch answer: points by our row id. Null when it isn't a geocoder answer (an
 * HTML error page, or rows whose id we never sent).
 */
export function parseCensusBatch(text: string, ids: ReadonlySet<string>): Map<string, LeadPoint> | null {
  const out = new Map<string, LeadPoint>();
  for (const row of parseCsv(text)) {
    const [id, , status, kind, , lonLat] = row.map((f) => f.trim());
    if (!ids.has(id)) return null;
    if (status !== 'Match' || !lonLat) continue;
    const [lng, lat] = lonLat.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.set(id, { lat, lng, exact: kind === 'Exact' });
  }
  return out;
}

/**
 * Geocodes street addresses with the Census batch geocoder, CHUNK per request, CONCURRENCY at a
 * time; each request retried once. `unreachable` when any request still fails (no signal, the
 * Census down or answering garbage): the caller asks the user to try again; nothing is half-located.
 */
export async function geocodeAddresses(requests: readonly LeadGeocodeRequest[], opts: GeocodeOptions = {}): Promise<GeocodeResult> {
  const doFetch = opts.fetch ?? fetch;
  const size = Math.min(CENSUS_BATCH_MAX, Math.max(1, opts.chunkSize ?? CHUNK));
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const chunks: LeadGeocodeRequest[][] = [];
  for (let i = 0; i < requests.length; i += size) chunks.push(requests.slice(i, i + size));
  const points = new Map<string, LeadPoint>();
  let done = 0;

  const send = async (chunk: readonly LeadGeocodeRequest[]): Promise<Map<string, LeadPoint> | null> => {
    const ids = chunk.map((_, i) => String(i + 1));
    const { body, contentType } = censusBatchBody(chunk, ids);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(CENSUS_BATCH_URL, { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: controller.signal });
      if (!res.ok) return null;
      return parseCensusBatch(await res.text(), new Set(ids));
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < chunks.length) {
      const chunk = chunks[next++];
      const found = (await send(chunk)) ?? (await send(chunk));
      if (!found) {
        failed = true;
        return;
      }
      for (const [id, point] of found) points.set(chunk[Number(id) - 1].key, point);
      done += chunk.length;
      opts.onProgress?.(done, requests.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, chunks.length) }, worker));
  return failed ? { ok: false, reason: 'unreachable' } : { ok: true, points };
}
