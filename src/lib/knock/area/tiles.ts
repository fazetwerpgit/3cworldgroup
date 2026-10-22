import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { adminStorage } from '@/lib/firebase/admin';
import type { GeoBox } from './geohash';
import {
  PARCEL_STATES_PATH,
  parcelIndexPath,
  parseParcelTile,
  tilePath,
  type ParcelIndex,
  type ParcelStates,
  type ParcelTile,
  type ParcelTileRecord,
} from './parcelTiles';

// Reads the parcel tiles (AREA_IMPORT_API.md section 7, multi-state layout) from Cloud Storage for
// the knock area routes. Server only. The bucket is PARCEL_TILES_BUCKET, else the project's default
// bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, as getOnboardingBucket reads it): admin.ts
// initializes the app without a storageBucket, so bucket() with no name would throw.
//
// parcels/states.json lists the tiled states with their boxes; each state whose box overlaps the
// polygon's has its own parcels/<state>/index.json (never merged: county slugs repeat across
// states). Without states.json (before the first multi-state upload) only Florida is read.

const gunzipAsync = promisify(gunzip);

const INDEX_TTL_MS = 10 * 60 * 1000;
/** States read when parcels/states.json does not exist. */
const FALLBACK_STATES = ['fl'] as const;
/** Padding (degrees) around the polygon's box when picking states, for points on a state's edge. */
const STATE_PICK_PAD_DEG = 0.01;
/**
 * Tile cache budget, in decoded (gunzipped) JSON bytes. A parsed tile takes about 1.0-1.5x its JSON
 * size on the heap, so 64 MB of JSON is roughly 65-100 MB of heap: a few dense Chicago tiles
 * (the largest, Cook `dp3wm`, is 12.7 MB of JSON / 69,000 homes) or dozens of Florida ones, well
 * inside a Vercel function's memory. Least recently used tiles go first.
 */
export const TILE_CACHE_MAX_BYTES = 64 * 1024 * 1024;
/** Tiles downloaded + parsed at once by one request (bounds the peak memory of a dense area). */
const TILE_READ_CONCURRENCY = 4;

/** Storage could not be read (or held something that is not a tile): the routes answer 503 tiles_unavailable. */
export class TilesUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TilesUnavailableError';
  }
}

type StateBoxes = ParcelStates['states'];

/** null = states.json does not exist (Florida only). */
let statesCache: { states: StateBoxes | null; at: number } | null = null;
const indexCache = new Map<string, { index: ParcelIndex; at: number }>();
// Keyed by the full tile path. Insertion order = recency (a hit is re-inserted), so the first key is the least recently used.
const tileCache = new Map<string, { tile: ParcelTile; bytes: number }>();
let tileCacheBytes = 0;
let tileCacheMaxBytes = TILE_CACHE_MAX_BYTES;

/** Tests only: forget the cached states, indexes and tiles (and set the tile cache budget, default TILE_CACHE_MAX_BYTES). */
export function resetTileCaches(opts: { maxBytes?: number } = {}): void {
  statesCache = null;
  indexCache.clear();
  tileCache.clear();
  tileCacheBytes = 0;
  tileCacheMaxBytes = opts.maxBytes ?? TILE_CACHE_MAX_BYTES;
}

/** Tests only: what the tile cache holds (paths, least recently used first) and its size in bytes. */
export function tileCacheStats(): { paths: string[]; bytes: number } {
  return { paths: [...tileCache.keys()], bytes: tileCacheBytes };
}

function tilesBucket() {
  const name = process.env.PARCEL_TILES_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!adminStorage || !name) throw new TilesUnavailableError('Parcel tiles bucket is not configured');
  return adminStorage.bucket(name);
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 404;
}

async function download(path: string, opts: { optional: true }): Promise<Buffer | null>;
async function download(path: string): Promise<Buffer>;
async function download(path: string, opts?: { optional: true }): Promise<Buffer | null> {
  try {
    const [bytes] = await tilesBucket().file(path).download();
    return bytes;
  } catch (error) {
    if (error instanceof TilesUnavailableError) throw error;
    if (opts?.optional && isNotFound(error)) return null;
    throw new TilesUnavailableError(`Could not read ${path}`, { cause: error });
  }
}

function parseJson(bytes: Buffer, what: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new TilesUnavailableError(`${what} is not JSON`, { cause: error });
  }
}

async function loadStates(now: number): Promise<StateBoxes | null> {
  if (statesCache && now - statesCache.at < INDEX_TTL_MS) return statesCache.states;
  const bytes = await download(PARCEL_STATES_PATH, { optional: true });
  let states: StateBoxes | null = null;
  if (bytes) {
    const json = parseJson(bytes, 'The parcel states list') as Partial<ParcelStates> | null;
    if (!json || typeof json !== 'object' || !json.states || typeof json.states !== 'object' || Array.isArray(json.states)) {
      throw new TilesUnavailableError('Not a parcel states list');
    }
    states = json.states;
  }
  statesCache = { states, at: now };
  return states;
}

function isBox(b: unknown): b is GeoBox {
  const x = b as Partial<GeoBox> | null;
  return !!x && [x.minLat, x.minLng, x.maxLat, x.maxLng].every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** The states whose box overlaps `box` padded by STATE_PICK_PAD_DEG (sorted); Florida alone without states.json. */
export function pickStates(states: StateBoxes | null, box: GeoBox): string[] {
  if (!states) return [...FALLBACK_STATES];
  const p = STATE_PICK_PAD_DEG;
  return Object.keys(states)
    .filter((state) => {
      const b = states[state]?.bbox;
      if (!/^[a-z]{2}$/.test(state) || !isBox(b)) return false;
      return b.minLat <= box.maxLat + p && b.maxLat >= box.minLat - p && b.minLng <= box.maxLng + p && b.maxLng >= box.minLng - p;
    })
    .sort();
}

async function loadIndex(state: string, now: number): Promise<ParcelIndex> {
  const hit = indexCache.get(state);
  if (hit && now - hit.at < INDEX_TTL_MS) return hit.index;
  const index = parseJson(await download(parcelIndexPath(state)), `The ${state} parcel index`) as ParcelIndex | null;
  if (!index || typeof index !== 'object' || !index.cells || typeof index.cells !== 'object') {
    throw new TilesUnavailableError(`Not a parcel index: ${state}`);
  }
  indexCache.set(state, { index, at: now });
  return index;
}

function cacheTile(path: string, tile: ParcelTile, bytes: number): void {
  // A tile over the whole budget is used by this request but never cached.
  if (bytes > tileCacheMaxBytes) return;
  const old = tileCache.get(path);
  if (old) {
    tileCache.delete(path);
    tileCacheBytes -= old.bytes;
  }
  tileCache.set(path, { tile, bytes });
  tileCacheBytes += bytes;
  while (tileCacheBytes > tileCacheMaxBytes) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCacheBytes -= tileCache.get(oldest)?.bytes ?? 0;
    tileCache.delete(oldest);
  }
}

// One download per path at a time, shared by concurrent requests of the same instance.
const inFlight = new Map<string, Promise<ParcelTile>>();

async function readTile(path: string): Promise<ParcelTile> {
  const bytes = await download(path);
  let json: Buffer;
  let tile: ParcelTile;
  try {
    json = await gunzipAsync(bytes);
    tile = parseParcelTile(JSON.parse(json.toString('utf8')));
  } catch (error) {
    throw new TilesUnavailableError(`Not a parcel tile: ${path}`, { cause: error });
  }
  cacheTile(path, tile, json.length);
  return tile;
}

function loadTile(path: string): Promise<ParcelTile> {
  const hit = tileCache.get(path);
  if (hit) {
    tileCache.delete(path);
    tileCache.set(path, hit);
    return Promise.resolve(hit.tile);
  }
  const pending = inFlight.get(path);
  if (pending) return pending;
  const p = readTile(path).finally(() => inFlight.delete(path));
  inFlight.set(path, p);
  return p;
}

/** `fn` over `items`, at most `limit` at a time; rejects with the first error (no new work starts after it). */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** One tiled roll read for an area. Older areaImports docs have no `state` (= 'fl'). */
export interface AreaSource {
  state: string;
  county: string;
  roll: string;
}

export interface AreaTileRecords {
  /** False when no cell is in any picked state's index (nothing is tiled there): 422 no_data_for_area. */
  indexed: boolean;
  /** The records of the tiles read whose point is inside `box` (edges included). */
  records: ParcelTileRecord[];
  /** The tiles read, one entry per state + county + roll, sorted. */
  sources: AreaSource[];
}

/**
 * The tile records of `cells` (geohash-5) whose point is inside `box` (the polygon's box), from
 * every state whose box overlaps it. Tiles are read a few at a time. Throws TilesUnavailableError.
 */
export async function loadAreaTileRecords(cells: readonly string[], box: GeoBox, now = Date.now()): Promise<AreaTileRecords> {
  const states = pickStates(await loadStates(now), box);
  const indexes = await Promise.all(states.map((s) => loadIndex(s, now)));
  const work: { state: string; path: string }[] = [];
  states.forEach((state, i) => {
    const index = indexes[i];
    for (const cell of cells) {
      const counties = index.cells[cell];
      if (!Array.isArray(counties)) continue;
      for (const county of counties) {
        if (typeof county === 'string' && county) work.push({ state, path: tilePath(state, county, cell) });
      }
    }
  });
  if (work.length === 0) return { indexed: false, records: [], sources: [] };

  const sources = new Map<string, AreaSource>();
  const records: ParcelTileRecord[] = [];
  await mapLimit(work, TILE_READ_CONCURRENCY, async ({ state, path }) => {
    const t = await loadTile(path);
    sources.set(`${state}\u0000${t.county}\u0000${t.roll}`, { state, county: t.county, roll: t.roll });
    for (const r of t.records) {
      if (r.lat >= box.minLat && r.lat <= box.maxLat && r.lng >= box.minLng && r.lng <= box.maxLng) records.push(r);
    }
  });
  return {
    indexed: true,
    records,
    sources: [...sources.values()].sort(
      (a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county) || a.roll.localeCompare(b.roll)
    ),
  };
}
