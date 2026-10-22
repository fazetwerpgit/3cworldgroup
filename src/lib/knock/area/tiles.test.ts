import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gunzipSync } from 'node:zlib';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: null,
  adminStorage: (await import('@/lib/knock/area/testing/fixtures')).createFakeStorage(),
}));

import { adminStorage } from '@/lib/firebase/admin';
import { loadAreaTileRecords, pickStates, resetTileCaches, tileCacheStats, TilesUnavailableError } from './tiles';
import { polygonBox } from './areaDraw';
import { geohashEncode, geohashesCoveringBox } from './geohash';
import { PARCEL_STATES_PATH, TILE_PRECISION, parcelIndexPath, tilePath } from './parcelTiles';
import {
  CA_LAT,
  CA_LNG,
  IL_LAT,
  IL_LNG,
  REAL_STATE_BOXES,
  SQUARE,
  buildMultiStateFiles,
  buildTileFiles,
  createFakeStorage,
  rec,
  squareAt,
  statesFile,
} from './testing/fixtures';

const storage = adminStorage as unknown as ReturnType<typeof createFakeStorage>;
/** REAL_STATE_BOXES as the `states` of states.json. */
const REAL = Object.fromEntries(Object.entries(REAL_STATE_BOXES).map(([st, bbox]) => [st, { builtAt: '', counties: 1, homes: 1, bbox }]));

function load(polygon = SQUARE) {
  const box = polygonBox(polygon);
  return loadAreaTileRecords(geohashesCoveringBox(box, TILE_PRECISION, 16)!, box);
}

function useFiles(files: Map<string, Buffer>) {
  storage.files.clear();
  for (const [k, v] of files) storage.files.set(k, v);
}

beforeEach(() => {
  process.env.PARCEL_TILES_BUCKET = 'tiles-bucket';
  storage.downloads.length = 0;
  storage.setFailing(false);
  useFiles(buildMultiStateFiles());
  resetTileCaches();
});

describe('pickStates', () => {
  it('Florida only without states.json', () => {
    expect(pickStates(null, polygonBox(squareAt(IL_LAT, IL_LNG)))).toEqual(['fl']);
  });

  it('the states whose box overlaps the polygon box, padded 0.01 degrees', () => {
    expect(pickStates(REAL, polygonBox(SQUARE))).toEqual(['fl']);
    expect(pickStates(REAL, polygonBox(squareAt(IL_LAT, IL_LNG)))).toEqual(['il']);
    expect(pickStates(REAL, polygonBox(squareAt(CA_LAT, CA_LNG)))).toEqual(['ca']);
    // Just outside Cook's east edge (-87.524807) but within the pad.
    const edge = { minLat: 41.8, maxLat: 41.81, minLng: -87.52, maxLng: -87.516 };
    expect(pickStates(REAL, edge)).toEqual(['il']);
    expect(pickStates(REAL, { ...edge, minLng: -87.5, maxLng: -87.49 })).toEqual([]);
    expect(pickStates({ ...REAL, tx: { builtAt: '', counties: 0, homes: 0, bbox: null } }, polygonBox(SQUARE))).toEqual(['fl']);
  });
});

describe('loadAreaTileRecords: states', () => {
  it('without states.json reads Florida only (a Chicago polygon has no data)', async () => {
    const fl = await load();
    expect(fl.indexed).toBe(true);
    expect(fl.sources).toEqual([{ state: 'fl', county: 'duval', roll: '2026F' }]);
    expect(storage.downloads).toContain(PARCEL_STATES_PATH);
    expect(storage.downloads).not.toContain(parcelIndexPath('il'));
    const il = await load(squareAt(IL_LAT, IL_LNG));
    expect(il).toEqual({ indexed: false, records: [], sources: [] });
    expect(storage.downloads.filter((p) => p === PARCEL_STATES_PATH)).toHaveLength(1);
  });

  it('with states.json reads only the overlapping state, each from its own index', async () => {
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    const il = await load(squareAt(IL_LAT, IL_LNG));
    expect(il.indexed).toBe(true);
    expect(il.sources).toEqual([{ state: 'il', county: 'cook', roll: '2026' }]);
    expect(il.records.every((r) => r.id.startsWith('il-cook-'))).toBe(true);
    expect(il.records).toHaveLength(5); // the far record is outside the box
    expect(storage.downloads).toContain(parcelIndexPath('il'));
    expect(storage.downloads).not.toContain(parcelIndexPath('fl'));
    expect(storage.downloads).not.toContain(parcelIndexPath('ca'));

    const ca = await load(squareAt(CA_LAT, CA_LNG));
    expect(ca.sources).toEqual([{ state: 'ca', county: 'los-angeles', roll: '2026' }]);
    expect(ca.records.every((r) => r.owner === '')).toBe(true);
  });

  it('keeps the indexes per state: the same county slug in two states reads both paths', async () => {
    // A made-up "lake" county in both Florida and Illinois, with both state boxes over SQUARE.
    const flLake = buildTileFiles([rec('35-0001', { address: '1 LAKE FL RD' })], 'lake', '2026F', { countyNo: '35' });
    const ilLake = buildTileFiles([rec('il-lake-01010000010000', { address: '1 LAKE IL RD', lat: 30.3001 })], 'lake', '2026', { state: 'il', countyNo: '097' });
    useFiles(new Map([...flLake, ...ilLake, statesFile({ fl: REAL_STATE_BOXES.fl, il: REAL_STATE_BOXES.fl })]));
    const r = await load();
    expect(r.sources).toEqual([
      { state: 'fl', county: 'lake', roll: '2026F' },
      { state: 'il', county: 'lake', roll: '2026' },
    ]);
    expect(r.records.map((x) => x.id).sort()).toEqual(['35-0001', 'il-lake-01010000010000']);
    expect(tileCacheStats().paths.sort()).toEqual([...flLake.keys(), ...ilLake.keys()].filter((p) => p.endsWith('.gz')).sort());
  });

  it('no_data (indexed false) only when no picked state has a cell', async () => {
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    // Inside Cook's box but no Cook tile there.
    expect((await load(squareAt(41.5, -88.2))).indexed).toBe(false);
    // Outside every state's box: nothing is read beyond states.json.
    storage.downloads.length = 0;
    expect(await load(squareAt(40, -100))).toEqual({ indexed: false, records: [], sources: [] });
    expect(storage.downloads).toEqual([]);
  });

  it('a listed state without its index is 503 (tiles_unavailable), as is a broken states.json', async () => {
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    storage.files.delete(parcelIndexPath('il'));
    await expect(load(squareAt(IL_LAT, IL_LNG))).rejects.toBeInstanceOf(TilesUnavailableError);
    resetTileCaches();
    storage.files.set(PARCEL_STATES_PATH, Buffer.from('{not json'));
    await expect(load()).rejects.toBeInstanceOf(TilesUnavailableError);
    resetTileCaches();
    storage.files.set(PARCEL_STATES_PATH, Buffer.from('[]'));
    await expect(load()).rejects.toBeInstanceOf(TilesUnavailableError);
  });

  it('Storage down while reading states.json is 503, never the Florida fallback', async () => {
    storage.setFailing(true);
    await expect(load()).rejects.toBeInstanceOf(TilesUnavailableError);
  });
});

describe('loadAreaTileRecords: tile cache by bytes', () => {
  const ilPaths = () => [...buildMultiStateFiles().keys()].filter((p) => p.startsWith('parcels/il/') && p.endsWith('.gz'));
  const decoded = (path: string) => gunzipSync(storage.files.get(path)!).length;

  it('keys tiles by full path and counts decoded bytes', async () => {
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    await load(squareAt(IL_LAT, IL_LNG));
    await load();
    const stats = tileCacheStats();
    expect(stats.paths.some((p) => p.startsWith('parcels/il/cook/'))).toBe(true);
    expect(stats.paths.some((p) => p.startsWith('parcels/fl/duval/'))).toBe(true);
    expect(stats.bytes).toBe(stats.paths.reduce((s, p) => s + decoded(p), 0));
    expect(stats.paths).toContain(tilePath('il', 'cook', geohashEncode(IL_LAT + 0.001, IL_LNG + 0.001, TILE_PRECISION)));
  });

  it('evicts the least recently used tiles once over the byte budget, and re-reads them', async () => {
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    const flBytes = [...storage.files.keys()].filter((p) => p.startsWith('parcels/fl/') && p.endsWith('.gz')).reduce((s, p) => s + decoded(p), 0);
    const ilBytes = ilPaths().reduce((s, p) => s + decoded(p), 0);
    // Room for Florida's tiles or Cook's, not both.
    resetTileCaches({ maxBytes: Math.max(flBytes, ilBytes) + 1 });
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    await load();
    expect(tileCacheStats().paths.every((p) => p.startsWith('parcels/fl/'))).toBe(true);
    await load(squareAt(IL_LAT, IL_LNG));
    const after = tileCacheStats();
    expect(after.paths.every((p) => p.startsWith('parcels/il/'))).toBe(true);
    expect(after.bytes).toBeLessThanOrEqual(Math.max(flBytes, ilBytes) + 1);
    // Florida was evicted: reading it again downloads its tiles again.
    storage.downloads.length = 0;
    await load();
    expect(storage.downloads.some((p) => p.startsWith('parcels/fl/duval/'))).toBe(true);
    // And pushed Cook out in turn.
    expect(tileCacheStats().paths.every((p) => p.startsWith('parcels/fl/'))).toBe(true);
  });

  it('a hit refreshes recency: the least recently used state goes first', async () => {
    storage.files.set(...statesFile(REAL_STATE_BOXES));
    const bytesOf = async (polygon: typeof SQUARE) => {
      resetTileCaches();
      await load(polygon);
      return tileCacheStats().bytes;
    };
    const fl = await bytesOf(SQUARE);
    const il = await bytesOf(squareAt(IL_LAT, IL_LNG));
    const ca = await bytesOf(squareAt(CA_LAT, CA_LNG));
    resetTileCaches({ maxBytes: fl + Math.max(il, ca) + 1 });
    await load();
    await load(squareAt(IL_LAT, IL_LNG));
    await load(); // Florida hit: now the most recent
    expect(tileCacheStats().bytes).toBe(fl + il);
    await load(squareAt(CA_LAT, CA_LNG));
    const paths = tileCacheStats().paths;
    expect(paths.filter((p) => p.startsWith('parcels/fl/')).length).toBeGreaterThan(0);
    expect(paths.filter((p) => p.startsWith('parcels/fl/')).reduce((s, p) => s + decoded(p), 0)).toBe(fl);
    expect(paths.filter((p) => p.startsWith('parcels/ca/')).reduce((s, p) => s + decoded(p), 0)).toBe(ca);
    expect(tileCacheStats().bytes).toBeLessThanOrEqual(fl + Math.max(il, ca) + 1);
  });

  it('a tile over the whole budget is used but never cached', async () => {
    const smallest = Math.min(...[...storage.files.keys()].filter((p) => p.startsWith('parcels/fl/') && p.endsWith('.gz')).map(decoded));
    resetTileCaches({ maxBytes: smallest - 1 });
    const r = await load();
    expect(r.records.length).toBeGreaterThan(0);
    expect(tileCacheStats()).toEqual({ paths: [], bytes: 0 });
  });

  it('reads at most 4 tiles at a time and shares one download between concurrent requests', async () => {
    // 9 cells of Cook tiles around the square.
    const recs = Array.from({ length: 9 }, (_, i) =>
      rec(`il-cook-1706000${String(i).padStart(7, '0')}`, { address: `${i + 1} GRID ST`, lat: IL_LAT - 0.04 + (i % 3) * 0.04, lng: IL_LNG - 0.04 + Math.floor(i / 3) * 0.04 })
    );
    useFiles(new Map([...buildTileFiles(recs, 'cook', '2026', { state: 'il', countyNo: '031' }), statesFile(REAL_STATE_BOXES)]));
    let active = 0;
    let peak = 0;
    const realBucket = storage.bucket;
    storage.bucket = ((name?: string) => {
      const b = realBucket(name);
      return {
        file: (path: string) => ({
          download: async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((r) => setTimeout(r, 5));
            try {
              return await b.file(path).download();
            } finally {
              active--;
            }
          },
        }),
      };
    }) as typeof storage.bucket;
    try {
      const wide = squareAt(IL_LAT, IL_LNG).map((p) => ({ lat: IL_LAT + (p.lat - IL_LAT) * 9, lng: IL_LNG + (p.lng - IL_LNG) * 9 }));
      const one = await load(wide);
      expect(one.records).toHaveLength(9);
      expect(peak).toBe(4);
      // Two requests at once on a cold cache download each tile once.
      resetTileCaches();
      storage.downloads.length = 0;
      const [a, b] = await Promise.all([load(wide), load(wide)]);
      expect(a.records).toHaveLength(9);
      expect(b.records).toHaveLength(9);
      const tileReads = storage.downloads.filter((p) => p.endsWith('.json.gz'));
      expect(tileReads.length).toBeGreaterThanOrEqual(9);
      expect(tileReads).toHaveLength(new Set(tileReads).size);
    } finally {
      storage.bucket = realBucket;
    }
  });
});
