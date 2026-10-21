import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { adminStorage } from '@/lib/firebase/admin';
import { parcelIndexPath, parseParcelTile, tilePath, type ParcelIndex, type ParcelTile, type ParcelTileRecord } from './parcelTiles';

// Reads the Florida parcel tiles (AREA_IMPORT_API.md section 7) from Cloud Storage for the knock
// area routes. Server only. The bucket is PARCEL_TILES_BUCKET, else the project's default bucket
// (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, as getOnboardingBucket reads it): admin.ts initializes the
// app without a storageBucket, so bucket() with no name would throw.

const gunzipAsync = promisify(gunzip);

const STATE = 'fl';
const INDEX_TTL_MS = 10 * 60 * 1000;
const TILE_CACHE_MAX = 64;

/** Storage could not be read (or held something that is not a tile): the routes answer 503 tiles_unavailable. */
export class TilesUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TilesUnavailableError';
  }
}

let indexCache: { index: ParcelIndex; at: number } | null = null;
// Insertion order = recency (a hit is re-inserted), so the first key is the least recently used.
const tileCache = new Map<string, ParcelTile>();

/** Tests only: forget the cached index and tiles. */
export function resetTileCaches(): void {
  indexCache = null;
  tileCache.clear();
}

function tilesBucket() {
  const name = process.env.PARCEL_TILES_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!adminStorage || !name) throw new TilesUnavailableError('Parcel tiles bucket is not configured');
  return adminStorage.bucket(name);
}

async function download(path: string): Promise<Buffer> {
  try {
    const [bytes] = await tilesBucket().file(path).download();
    return bytes;
  } catch (error) {
    if (error instanceof TilesUnavailableError) throw error;
    throw new TilesUnavailableError(`Could not read ${path}`, { cause: error });
  }
}

async function loadIndex(now: number): Promise<ParcelIndex> {
  if (indexCache && now - indexCache.at < INDEX_TTL_MS) return indexCache.index;
  const bytes = await download(parcelIndexPath(STATE));
  let index: ParcelIndex;
  try {
    index = JSON.parse(bytes.toString('utf8')) as ParcelIndex;
  } catch (error) {
    throw new TilesUnavailableError('The parcel index is not JSON', { cause: error });
  }
  if (!index || typeof index !== 'object' || !index.cells || typeof index.cells !== 'object') {
    throw new TilesUnavailableError('Not a parcel index');
  }
  indexCache = { index, at: now };
  return index;
}

async function loadTile(path: string): Promise<ParcelTile> {
  const hit = tileCache.get(path);
  if (hit) {
    tileCache.delete(path);
    tileCache.set(path, hit);
    return hit;
  }
  const bytes = await download(path);
  let tile: ParcelTile;
  try {
    tile = parseParcelTile(JSON.parse((await gunzipAsync(bytes)).toString('utf8')));
  } catch (error) {
    throw new TilesUnavailableError(`Not a parcel tile: ${path}`, { cause: error });
  }
  tileCache.set(path, tile);
  while (tileCache.size > TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCache.delete(oldest);
  }
  return tile;
}

export interface AreaTileRecords {
  /** False when none of the cells is in the index (no county there is tiled): 422 no_data_for_area. */
  indexed: boolean;
  records: ParcelTileRecord[];
  /** The tiles read, one entry per county + roll, sorted. */
  sources: { county: string; roll: string }[];
}

/** Every tile record of `cells` (geohash-5), read in parallel. Throws TilesUnavailableError. */
export async function loadAreaTileRecords(cells: readonly string[], now = Date.now()): Promise<AreaTileRecords> {
  const index = await loadIndex(now);
  const paths: string[] = [];
  for (const cell of cells) {
    const counties = index.cells[cell];
    if (!Array.isArray(counties)) continue;
    for (const county of counties) paths.push(tilePath(STATE, county, cell));
  }
  if (paths.length === 0) return { indexed: false, records: [], sources: [] };
  const tiles = await Promise.all(paths.map(loadTile));
  const sources = new Map<string, { county: string; roll: string }>();
  const records: ParcelTileRecord[] = [];
  for (const t of tiles) {
    sources.set(`${t.county}\u0000${t.roll}`, { county: t.county, roll: t.roll });
    records.push(...t.records);
  }
  return {
    indexed: true,
    records,
    sources: [...sources.values()].sort((a, b) => a.county.localeCompare(b.county) || a.roll.localeCompare(b.roll)),
  };
}
