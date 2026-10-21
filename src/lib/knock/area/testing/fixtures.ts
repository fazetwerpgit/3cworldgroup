import { gzipSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { geohashEncode } from '../geohash';
import { parcelIndexPath, tilePath, type ParcelIndex, type ParcelTile, type ParcelTileRecord } from '../parcelTiles';
import type { LatLng } from '../areaDraw';

// Synthetic parcel tiles for the knock area route tests (made-up parcel ids, streets and owners).

export const LAT = 30.3;
export const LNG = -81.65;
/** A ~1.1 km square around (LAT, LNG). */
export const SQUARE: LatLng[] = [
  { lat: LAT - 0.005, lng: LNG - 0.005 },
  { lat: LAT - 0.005, lng: LNG + 0.005 },
  { lat: LAT + 0.005, lng: LNG + 0.005 },
  { lat: LAT + 0.005, lng: LNG - 0.005 },
];

export function rec(id: string, over: Partial<ParcelTileRecord> = {}): ParcelTileRecord {
  return {
    id,
    lat: LAT,
    lng: LNG,
    address: `100 TEST ST`,
    city: 'JACKSONVILLE',
    zip: '32207',
    use: '001',
    homestead: true,
    owner: 'SMITH JOHN A',
    ...over,
  };
}

/** Inside SQUARE: 2 houses to add, 1 rented house, 1 mobile home, a 2-unit condo building, a duplex; one record outside. */
export const RECORDS: ParcelTileRecord[] = [
  rec('26-0001', { address: '101 OAK ST', lat: LAT + 0.001, lng: LNG + 0.001 }),
  rec('26-0002', { address: '102 OAK ST', lat: LAT + 0.0015, lng: LNG + 0.001, homestead: false, owner: 'LANDLORD LLC' }),
  rec('26-0003', { address: '103 OAK ST', lat: LAT + 0.002, lng: LNG + 0.001, use: '002', owner: 'DOE JANE' }),
  rec('26-0004', { address: '500 BAY ST 101', lat: LAT - 0.002, lng: LNG - 0.002, use: '004', owner: 'UNIT ONE OWNER' }),
  rec('26-0005', { address: '500 BAY ST 102', lat: LAT - 0.002, lng: LNG - 0.0021, use: '004', homestead: false, owner: '' }),
  rec('26-0006', { address: '700 PINE ST', lat: LAT - 0.003, lng: LNG + 0.003, use: '008', owner: 'DUPLEX OWNER' }),
  rec('26-0007', { address: '104 OAK ST', lat: LAT + 0.0025, lng: LNG + 0.001, owner: 'ROE RICHARD' }),
  rec('26-0099', { address: '999 FAR AWAY RD', lat: LAT + 0.02, lng: LNG + 0.02 }),
];

/** Object path -> gzip bytes (tiles) or JSON bytes (index), as the private bucket holds them. */
export function buildTileFiles(records: readonly ParcelTileRecord[] = RECORDS, county = 'duval', roll = '2026F'): Map<string, Buffer> {
  const byCell = new Map<string, ParcelTileRecord[]>();
  for (const r of records) {
    const gh = geohashEncode(r.lat, r.lng, 5);
    byCell.set(gh, [...(byCell.get(gh) ?? []), r]);
  }
  const files = new Map<string, Buffer>();
  const index: ParcelIndex = {
    v: 1,
    state: 'fl',
    builtAt: '2026-10-21T00:00:00Z',
    counties: { [county]: { countyNo: '26', roll, builtAt: '2026-10-21T00:00:00Z', homes: records.length, tiles: byCell.size } },
    cells: {},
  };
  for (const [gh, recs] of byCell) {
    const tile: ParcelTile = {
      v: 1,
      state: 'fl',
      county,
      countyNo: '26',
      geohash: gh,
      roll,
      builtAt: '2026-10-21T00:00:00Z',
      records: [...recs].sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
    files.set(tilePath('fl', county, gh), gzipSync(Buffer.from(JSON.stringify(tile))));
    index.cells[gh] = [county];
  }
  files.set(parcelIndexPath('fl'), Buffer.from(JSON.stringify(index)));
  return files;
}

/** A fake admin Storage over `files`; `downloads` lists every object read. */
export function createFakeStorage() {
  const files = new Map<string, Buffer>();
  const downloads: string[] = [];
  const buckets: string[] = [];
  let failing = false;
  const storage = {
    files,
    downloads,
    buckets,
    setFailing: (on: boolean) => {
      failing = on;
    },
    bucket: (name?: string) => {
      buckets.push(String(name));
      return {
        file: (path: string) => ({
          download: async (): Promise<[Buffer]> => {
            downloads.push(path);
            if (failing) throw Object.assign(new Error('Storage is down'), { code: 503 });
            const bytes = files.get(path);
            if (!bytes) throw Object.assign(new Error(`No such object: ${path}`), { code: 404 });
            return [bytes];
          },
        }),
      };
    },
  };
  return storage;
}

export function postReq(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer t', ...headers },
  });
}

export function getReq(path: string) {
  return new NextRequest(`http://localhost${path}`, { headers: { authorization: 'Bearer t' } });
}

export const OWNER = { ok: true as const, uid: 'own', name: 'Olive Owner', knockRole: 'owner' as const, campaignIds: [] };
export const MANAGER = { ok: true as const, uid: 'mgr', name: 'Max Manager', knockRole: 'manager' as const, campaignIds: ['solar'] };
export const REP = { ok: true as const, uid: 'rep', name: 'Ray Rep', knockRole: 'rep' as const, campaignIds: ['solar'] };
