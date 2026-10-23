import { gzipSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { geohashEncode } from '../geohash';
import {
  PARCEL_STATES_PATH,
  parcelIndexPath,
  tilePath,
  type CountyFields,
  type ParcelIndex,
  type ParcelStates,
  type ParcelTile,
  type ParcelTileRecord,
} from '../parcelTiles';
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
export function buildTileFiles(
  records: readonly ParcelTileRecord[] = RECORDS,
  county = 'duval',
  roll = '2026F',
  opts: { state?: string; countyNo?: string; fields?: CountyFields } = {}
): Map<string, Buffer> {
  const state = opts.state ?? 'fl';
  const countyNo = opts.countyNo ?? '26';
  const byCell = new Map<string, ParcelTileRecord[]>();
  for (const r of records) {
    const gh = geohashEncode(r.lat, r.lng, 5);
    byCell.set(gh, [...(byCell.get(gh) ?? []), r]);
  }
  const files = new Map<string, Buffer>();
  const index: ParcelIndex = {
    v: 1,
    state,
    builtAt: '2026-10-21T00:00:00Z',
    counties: {
      [county]: { countyNo, roll, builtAt: '2026-10-21T00:00:00Z', homes: records.length, tiles: byCell.size, ...(opts.fields ? { fields: opts.fields } : {}) },
    },
    cells: {},
  };
  for (const [gh, recs] of byCell) {
    const tile: ParcelTile = {
      v: 1,
      state,
      county,
      countyNo,
      geohash: gh,
      roll,
      builtAt: '2026-10-21T00:00:00Z',
      records: [...recs].sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
    files.set(tilePath(state, county, gh), gzipSync(Buffer.from(JSON.stringify(tile))));
    index.cells[gh] = [county];
  }
  files.set(parcelIndexPath(state), Buffer.from(JSON.stringify(index)));
  return files;
}

// Multi-state samples, shaped like the real il/cook and ca/los-angeles tiles (made-up PINs / AINs,
// streets and owners). Cook: 14-digit PIN ids, owner-occupied is a mailing-address ESTIMATE, a
// condo unit is the last word ("5876 N RIDGE AVE G"), zip may be ''. Los Angeles: 10-digit AIN
// ids, half-number addresses, no owner names ('').

export const IL_LAT = 41.9;
export const IL_LNG = -87.68;
export const CA_LAT = 34.05;
export const CA_LNG = -118.3;

/** A ~1.1 km square around (lat, lng). */
export function squareAt(lat: number, lng: number): LatLng[] {
  return [
    { lat: lat - 0.005, lng: lng - 0.005 },
    { lat: lat - 0.005, lng: lng + 0.005 },
    { lat: lat + 0.005, lng: lng + 0.005 },
    { lat: lat + 0.005, lng: lng - 0.005 },
  ];
}

const il = (pin: string, over: Partial<ParcelTileRecord>): ParcelTileRecord =>
  rec(`il-cook-${pin}`, { lat: IL_LAT, lng: IL_LNG, city: 'CHICAGO', zip: '60622', owner: 'TEST OWNER', ...over });
const ca = (ain: string, over: Partial<ParcelTileRecord>): ParcelTileRecord =>
  rec(`ca-los-angeles-${ain}`, { lat: CA_LAT, lng: CA_LNG, city: 'LOS ANGELES', zip: '90019', owner: '', ...over });

/** Inside squareAt(IL_LAT, IL_LNG): a house (zip ''), a rented 2-flat, a 3-unit condo building (one unit unnamed); one record outside. */
export const IL_RECORDS: ParcelTileRecord[] = [
  il('17060000010000', { address: '1200 N TEST AVE', lat: IL_LAT + 0.001, lng: IL_LNG + 0.001, zip: '', owner: 'PAT SAMPLE' }),
  il('17060000020000', { address: '1202 N TEST AVE', lat: IL_LAT + 0.0012, lng: IL_LNG + 0.001, use: '008', homestead: false, owner: 'FLAT HOLDINGS LLC' }),
  il('17060000031001', { address: '5876 N SAMPLE AVE 1', lat: IL_LAT - 0.002, lng: IL_LNG - 0.002, use: '004', owner: 'UNIT A OWNER' }),
  il('17060000031002', { address: '5876 N SAMPLE AVE 2', lat: IL_LAT - 0.002, lng: IL_LNG - 0.002, use: '004', homestead: false, owner: 'UNIT B OWNER' }),
  il('17060000031003', { address: '5876 N SAMPLE AVE G', lat: IL_LAT - 0.002, lng: IL_LNG - 0.002, use: '004', owner: '' }),
  il('17069999990000', { address: '9 FAR RD', lat: IL_LAT + 0.03, lng: IL_LNG + 0.03 }),
];

/** Inside squareAt(CA_LAT, CA_LNG): a house, a half-number house (no exemption), a 2-unit condo building; all without owner names. */
export const CA_RECORDS: ParcelTileRecord[] = [
  ca('5070000001', { address: '2212 TEST BLVD', lat: CA_LAT + 0.001, lng: CA_LNG + 0.001 }),
  ca('5070000002', { address: '2212 1/2 TEST BLVD', lat: CA_LAT + 0.0011, lng: CA_LNG + 0.0012, homestead: false }),
  ca('5070000101', { address: '300 S SAMPLE ST 7', lat: CA_LAT - 0.002, lng: CA_LNG - 0.002, use: '004' }),
  ca('5070000102', { address: '300 S SAMPLE ST 8', lat: CA_LAT - 0.002, lng: CA_LNG - 0.0021, use: '004' }),
];

/** Florida (RECORDS), Cook and Los Angeles tiles + each state's index, without states.json. */
export function buildMultiStateFiles(): Map<string, Buffer> {
  return new Map([
    ...buildTileFiles(),
    ...buildTileFiles(IL_RECORDS, 'cook', '2026', { state: 'il', countyNo: '031', fields: { ownerOccupied: 'mailing-match', ownerNames: true } }),
    ...buildTileFiles(CA_RECORDS, 'los-angeles', '2026', { state: 'ca', countyNo: '037', fields: { ownerOccupied: 'exemption', ownerNames: false } }),
  ]);
}

// Orange, CA: no owner-occupied signal (`fields.ownerOccupied: 'none'`): every `homestead` is false
// (unknown, not rented) and there are no owner names. Ids `ca-orange-<8-digit APN>` (made up).

export const OC_LAT = 33.75;
export const OC_LNG = -117.87;

const oc = (apn: string, over: Partial<ParcelTileRecord>): ParcelTileRecord =>
  rec(`ca-orange-${apn}`, { lat: OC_LAT, lng: OC_LNG, city: 'SANTA ANA', zip: '92701', homestead: false, owner: '', ...over });

/**
 * Inside squareAt(OC_LAT, OC_LNG): two houses, a 2-unit condo building, a duplex. Plus one house
 * inside squareAt(CA_LAT, CA_LNG), so a polygon there covers Los Angeles and Orange (synthetic).
 */
export const OC_RECORDS: ParcelTileRecord[] = [
  oc('10000001', { address: '10 ORANGE TEST AVE', lat: OC_LAT + 0.001, lng: OC_LNG + 0.001 }),
  oc('10000002', { address: '12 ORANGE TEST AVE', lat: OC_LAT + 0.0012, lng: OC_LNG + 0.001 }),
  oc('10000101', { address: '50 CITRUS ST 1', lat: OC_LAT - 0.002, lng: OC_LNG - 0.002, use: '004' }),
  oc('10000102', { address: '50 CITRUS ST 2', lat: OC_LAT - 0.002, lng: OC_LNG - 0.0021, use: '004' }),
  oc('10000201', { address: '70 GROVE ST', lat: OC_LAT - 0.003, lng: OC_LNG + 0.003, use: '008' }),
  oc('20000001', { address: '400 BORDER TEST AVE', lat: CA_LAT + 0.003, lng: CA_LNG - 0.003 }),
];

/** Tile file maps merged: a state index written by more than one map gets the union of their counties and cells. */
export function mergeTileFiles(...maps: Map<string, Buffer>[]): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const m of maps) {
    for (const [path, bytes] of m) {
      const prev = out.get(path);
      if (!prev || !/^parcels\/[a-z]{2}\/index\.json$/.test(path)) {
        out.set(path, bytes);
        continue;
      }
      const a = JSON.parse(prev.toString()) as ParcelIndex;
      const b = JSON.parse(bytes.toString()) as ParcelIndex;
      const cells: ParcelIndex['cells'] = { ...a.cells };
      for (const [gh, counties] of Object.entries(b.cells)) cells[gh] = [...new Set([...(cells[gh] ?? []), ...counties])].sort();
      out.set(path, Buffer.from(JSON.stringify({ ...a, counties: { ...a.counties, ...b.counties }, cells })));
    }
  }
  return out;
}

/** buildMultiStateFiles plus Orange, CA (`fields.ownerOccupied: 'none'`) in the same California index. */
export function buildMultiStateFilesWithOrange(): Map<string, Buffer> {
  return mergeTileFiles(
    buildMultiStateFiles(),
    buildTileFiles(OC_RECORDS, 'orange', '2026', { state: 'ca', countyNo: '059', fields: { ownerOccupied: 'none', ownerNames: false } })
  );
}

/** `parcels/states.json` bytes with each state's box (the real file's shape). */
export function statesFile(boxes: Record<string, ParcelStates['states'][string]['bbox']>): [string, Buffer] {
  const states: ParcelStates = {
    v: 1,
    builtAt: '2026-10-22T00:00:00Z',
    states: Object.fromEntries(Object.entries(boxes).map(([st, bbox]) => [st, { builtAt: '2026-10-22T00:00:00Z', counties: 1, homes: 1, bbox }])),
  };
  return [PARCEL_STATES_PATH, Buffer.from(JSON.stringify(states))];
}

/** The real states.json boxes (2026-10-22 build). */
export const REAL_STATE_BOXES = {
  ca: { minLat: 33.335241, minLng: -118.940332, maxLat: 34.819658, maxLng: -117.6524 },
  fl: { minLat: 24.54608, minLng: -87.599027, maxLat: 31.00039, maxLng: -80.032399 },
  il: { minLat: 41.469835, minLng: -88.263506, maxLat: 42.153979, maxLng: -87.524807 },
};

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
