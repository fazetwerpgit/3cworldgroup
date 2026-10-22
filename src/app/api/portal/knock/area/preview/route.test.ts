import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/knock/area/testing/fakeKnockDb')).createFakeKnockDb(),
  adminStorage: (await import('@/lib/knock/area/testing/fixtures')).createFakeStorage(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedKnockCaller: vi.fn() }));

import { POST } from './route';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { requireVerifiedKnockCaller } from '@/lib/auth/requireVerifiedAdmin';
import { resetTileCaches } from '@/lib/knock/area/tiles';
import { areaDoorId } from '@/lib/knock/area/areaImport';
import { tilePath } from '@/lib/knock/area/parcelTiles';
import { geohashEncode } from '@/lib/knock/area/geohash';
import type { FakeKnockDb } from '@/lib/knock/area/testing/fakeKnockDb';
import {
  CA_LAT,
  CA_LNG,
  IL_LAT,
  IL_LNG,
  LAT,
  LNG,
  MANAGER,
  OWNER,
  REAL_STATE_BOXES,
  REP,
  SQUARE,
  buildMultiStateFiles,
  buildTileFiles,
  createFakeStorage,
  postReq,
  rec,
  squareAt,
  statesFile,
} from '@/lib/knock/area/testing/fixtures';

const db = adminDb as unknown as FakeKnockDb;
const storage = adminStorage as unknown as ReturnType<typeof createFakeStorage>;
const gate = requireVerifiedKnockCaller as unknown as ReturnType<typeof vi.fn>;

const PATH = '/api/portal/knock/area/preview';
const ON = { housesOnly: true, ownerOccupiedOnly: true };
const OFF = { housesOnly: false, ownerOccupiedOnly: false };
const body = (over: Record<string, unknown> = {}) => ({ campaignId: 'solar', polygon: SQUARE, ...ON, ...over });

async function call(b: unknown, headers?: Record<string, string>) {
  const res = await POST(postReq(PATH, b, headers));
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  process.env.PARCEL_TILES_BUCKET = 'tiles-bucket';
  db.store.clear();
  db.queries.length = 0;
  db.seed('campaigns', { solar: { name: 'Solar', type: 'solar' }, fiber: { name: 'Fiber', type: 'fiber' } });
  storage.files.clear();
  storage.downloads.length = 0;
  storage.buckets.length = 0;
  storage.setFailing(false);
  for (const [k, v] of buildTileFiles()) storage.files.set(k, v);
  resetTileCaches();
  gate.mockReset().mockResolvedValue(OWNER);
});

describe('POST /api/portal/knock/area/preview: auth and permission', () => {
  it('401 unauthenticated when the token is missing or bad', async () => {
    gate.mockResolvedValue({ ok: false, status: 401, error: 'Missing authentication token' });
    const r = await call(body());
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('unauthenticated');
  });

  it('403 not_allowed for a switched-off account', async () => {
    gate.mockResolvedValue({ ok: false, status: 403, error: 'Account is not active' });
    expect(await call(body())).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
  });

  it('403 not_allowed for a rep, even on their own campaign', async () => {
    gate.mockResolvedValue(REP);
    expect(await call(body())).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    expect(storage.downloads).toEqual([]);
  });

  it('403 for a manager off the campaign; 200 on it', async () => {
    gate.mockResolvedValue(MANAGER);
    expect(await call(body({ campaignId: 'fiber' }))).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    expect((await call(body())).status).toBe(200);
  });

  it('an owner may preview any campaign', async () => {
    expect((await call(body({ campaignId: 'fiber' }))).status).toBe(200);
  });

  it('checks the body (400) before the campaign (404) before the role (403)', async () => {
    gate.mockResolvedValue(REP);
    expect(await call({ campaignId: 'solar' })).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
    expect(await call(body({ campaignId: 'nope' }))).toMatchObject({ status: 404, json: { error: 'campaign_not_found' } });
  });
});

describe('POST /api/portal/knock/area/preview: validation', () => {
  it.each([
    ['not JSON', '{'],
    ['an array', [1]],
    ['no switches', { campaignId: 'solar', polygon: SQUARE }],
    ['a string switch', body({ housesOnly: 'yes' })],
    ['no campaignId', body({ campaignId: undefined })],
    ['a campaignId with a slash', body({ campaignId: 'a/b' })],
    ['a polygon that is not an array', body({ polygon: 'square' })],
  ])('400 invalid_request for %s', async (_name, b) => {
    expect(await call(b)).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
  });

  it.each([
    ['2 points', SQUARE.slice(0, 2)],
    ['an out-of-range point', [...SQUARE.slice(0, 3), { lat: 95, lng: 0 }]],
    ['zero area', [SQUARE[0], SQUARE[0], SQUARE[0]]],
    ['too many points', Array.from({ length: 1001 }, (_, i) => ({ lat: LAT + Math.sin(i) * 0.001, lng: LNG + Math.cos(i) * 0.001 }))],
  ])('400 invalid_polygon for %s', async (_name, polygon) => {
    expect(await call(body({ polygon }))).toMatchObject({ status: 400, json: { error: 'invalid_polygon' } });
  });
});

describe('POST /api/portal/knock/area/preview: homes', () => {
  it('returns the homes inside the polygon from the gzipped tiles, classified with the switches sent', async () => {
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(r.json.campaignId).toBe('solar');
    expect(r.json.maxHomes).toBe(2000);
    expect(r.json.sources).toEqual([{ state: 'fl', county: 'duval', roll: '2026F' }]);
    expect(r.json.counts).toEqual({ inside: 6, add: 3, skipRented: 1, skipType: 2, alreadyInCampaign: 0 });
    const ids = r.json.homes.map((h: { id: string }) => h.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).not.toContain(areaDoorId('solar', '26-0099'));
    const house = r.json.homes.find((h: { id: string }) => h.id === areaDoorId('solar', '26-0001'));
    expect(house).toEqual({
      id: areaDoorId('solar', '26-0001'),
      lat: LAT + 0.001,
      lng: LNG + 0.001,
      address: '101 Oak St',
      city: 'Jacksonville',
      zip: '32207',
      ownerName: 'Smith John A',
      unitOrder: null,
      unitOwnerNames: null,
      homestead: true,
      useType: '001',
      propertyType: 'single-family',
      inCampaign: false,
      status: 'add',
    });
    const condo = r.json.homes.find((h: { unitOrder: string[] | null }) => h.unitOrder);
    expect(condo).toMatchObject({
      address: '500 Bay St',
      unitOrder: ['101', '102'],
      unitOwnerNames: { '101': 'Unit One Owner' },
      ownerName: null,
      propertyType: 'condo',
      homestead: false,
      status: 'skip-type',
    });
    expect(r.json.homes.find((h: { id: string }) => h.id === areaDoorId('solar', '26-0002')).status).toBe('skip-rented');
    expect(db.store.get('houses')?.size ?? 0).toBe(0);
    expect(db.store.get('areaImports')).toBeUndefined();
    expect(storage.buckets).toContain('tiles-bucket');
  });

  it('with both switches off every door inside is add', async () => {
    const r = await call(body(OFF));
    expect(r.json.counts).toEqual({ inside: 6, add: 6, skipRented: 0, skipType: 0, alreadyInCampaign: 0 });
  });

  it('a polygon that clips the street keeps only the doors inside it', async () => {
    // A thin triangle around 101-104 Oak St only.
    const tri = [
      { lat: LAT + 0.0005, lng: LNG + 0.0005 },
      { lat: LAT + 0.0005, lng: LNG + 0.0015 },
      { lat: LAT + 0.003, lng: LNG + 0.001 },
    ];
    const r = await call(body({ polygon: tri, ...OFF }));
    expect(r.json.homes.map((h: { address: string }) => h.address)).toEqual(['101 Oak St', '102 Oak St', '103 Oak St', '104 Oak St']);
  });

  it('marks doors already in the campaign (same id, same address, within 4 m) within the 500 m buffer', async () => {
    db.seed('houses', {
      [areaDoorId('solar', '26-0001')]: { campaignId: 'solar', address: '101 Oak St', city: 'Jacksonville', lat: LAT + 0.001, lng: LNG + 0.001, packId: 'p1', packName: 'P1' },
      byAddress: { campaignId: 'solar', address: '104 OAK ST', city: 'Jacksonville', lat: LAT + 0.0045, lng: LNG + 0.001, packId: 'p1', packName: 'P1' },
      otherCampaign: { campaignId: 'fiber', address: '103 Oak St', city: 'Jacksonville', lat: LAT + 0.002, lng: LNG + 0.001 },
      farLng: { campaignId: 'solar', address: '103 Oak St', city: 'Jacksonville', lat: LAT + 0.002, lng: LNG + 0.5 },
    });
    const r = await call(body());
    expect(r.json.counts).toEqual({ inside: 6, add: 1, skipRented: 1, skipType: 2, alreadyInCampaign: 2 });
    const status = (pid: string) => r.json.homes.find((h: { id: string }) => h.id === areaDoorId('solar', pid)).status;
    expect(status('26-0001')).toBe('already-in-campaign');
    expect(status('26-0007')).toBe('already-in-campaign');
    expect(status('26-0003')).toBe('add');
    const q = db.queries.find((x) => x.collection === 'houses')!;
    expect(q.filters.map((f) => `${f.field}${f.op}`)).toEqual(['campaignId==', 'lat>=', 'lat<=']);
    expect(q.filters[1].value).toBeCloseTo(LAT - 0.01, 9);
  });

  it('caches the index and the tiles between requests', async () => {
    await call(body());
    const first = storage.downloads.length;
    expect(first).toBeGreaterThan(1);
    await call(body());
    expect(storage.downloads.length).toBe(first);
  });

  it('reads every county of a cell on a county line', async () => {
    const files = buildTileFiles();
    const gh = geohashEncode(LAT + 0.001, LNG + 0.001, 5);
    const clay = { v: 1, state: 'fl', county: 'clay', countyNo: '20', geohash: gh, roll: '2026P', builtAt: '', records: [rec('20-0001', { address: '1 CLAY RD', lat: LAT + 0.0011, lng: LNG + 0.0011 })] };
    files.set(tilePath('fl', 'clay', gh), gzipSync(Buffer.from(JSON.stringify(clay))));
    const index = JSON.parse(files.get('parcels/fl/index.json')!.toString());
    index.cells[gh] = ['clay', 'duval'];
    files.set('parcels/fl/index.json', Buffer.from(JSON.stringify(index)));
    storage.files.clear();
    for (const [k, v] of files) storage.files.set(k, v);
    const r = await call(body(OFF));
    expect(r.json.counts.inside).toBe(7);
    expect(r.json.sources).toEqual([{ state: 'fl', county: 'clay', roll: '2026P' }, { state: 'fl', county: 'duval', roll: '2026F' }]);
  });
});

describe('POST /api/portal/knock/area/preview: 422 and 503', () => {
  it('422 too_big (inside null) when the box covers more than 16 cells', async () => {
    const big = [
      { lat: 30, lng: -82 },
      { lat: 30, lng: -81 },
      { lat: 31, lng: -81 },
    ];
    expect(await call(body({ polygon: big }))).toEqual({ status: 422, json: { error: 'too_big', inside: null, max: 2000 } });
    expect(storage.downloads).toEqual([]);
  });

  it('422 too_big with the count when more than 2,000 doors are inside', async () => {
    const many = Array.from({ length: 2001 }, (_, i) =>
      rec(`26-${String(i).padStart(5, '0')}`, { address: `${i + 1} GRID ST`, lat: LAT - 0.004 + (i % 50) * 0.00016, lng: LNG - 0.004 + Math.floor(i / 50) * 0.0002 })
    );
    storage.files.clear();
    for (const [k, v] of buildTileFiles(many)) storage.files.set(k, v);
    expect(await call(body(OFF))).toEqual({ status: 422, json: { error: 'too_big', inside: 2001, max: 2000 } });
  });

  it('422 no_data_for_area when no cell is in the index', async () => {
    const elsewhere = SQUARE.map((p) => ({ lat: p.lat - 3, lng: p.lng }));
    expect(await call(body({ polygon: elsewhere }))).toEqual({ status: 422, json: { error: 'no_data_for_area' } });
  });

  it('503 tiles_unavailable when Storage fails', async () => {
    storage.setFailing(true);
    expect(await call(body())).toEqual({ status: 503, json: { error: 'tiles_unavailable' } });
  });

  it('503 tiles_unavailable when an indexed tile is missing or not gzip', async () => {
    const gh = geohashEncode(LAT + 0.001, LNG + 0.001, 5);
    storage.files.set(tilePath('fl', 'duval', gh), Buffer.from('not gzip'));
    expect((await call(body())).status).toBe(503);
    resetTileCaches();
    storage.files.delete(tilePath('fl', 'duval', gh));
    expect((await call(body())).status).toBe(503);
  });
});

describe('POST /api/portal/knock/area/preview: Illinois and California tiles', () => {
  const multi = (withStates = true) => {
    storage.files.clear();
    for (const [k, v] of buildMultiStateFiles()) storage.files.set(k, v);
    if (withStates) storage.files.set(...statesFile(REAL_STATE_BOXES));
  };

  it('a Cook polygon: Cook doors with state in sources, the estimated owner-occupied flag as is', async () => {
    multi();
    const r = await call(body({ polygon: squareAt(IL_LAT, IL_LNG), ...OFF }));
    expect(r.status).toBe(200);
    expect(r.json.sources).toEqual([{ state: 'il', county: 'cook', roll: '2026' }]);
    expect(r.json.homes.map((h: { id: string }) => h.id)).toEqual([
      areaDoorId('solar', 'il-cook-17060000010000'),
      areaDoorId('solar', 'il-cook-17060000020000'),
      areaDoorId('solar', 'il-cook-17060000031001', true),
    ]);
    const flat = r.json.homes.find((h: { id: string }) => h.id === areaDoorId('solar', 'il-cook-17060000020000'));
    expect(flat).toMatchObject({ address: '1202 N Test Ave', city: 'Chicago', propertyType: 'multi-family', homestead: false, ownerName: 'Flat Holdings LLC' });
    const condo = r.json.homes.find((h: { unitOrder: string[] | null }) => h.unitOrder);
    expect(condo).toMatchObject({ address: '5876 N Sample Ave', unitOrder: ['1', '2', 'G'], unitOwnerNames: { '1': 'Unit A Owner', '2': 'Unit B Owner' }, homestead: true });
    expect(storage.downloads).not.toContain('parcels/fl/index.json');
    const on = await call(body({ polygon: squareAt(IL_LAT, IL_LNG) }));
    expect(on.json.counts).toEqual({ inside: 3, add: 1, skipRented: 0, skipType: 2, alreadyInCampaign: 0 });
  });

  it('a Los Angeles polygon: doors without owner names', async () => {
    multi();
    const r = await call(body({ polygon: squareAt(CA_LAT, CA_LNG), ...OFF }));
    expect(r.status).toBe(200);
    expect(r.json.sources).toEqual([{ state: 'ca', county: 'los-angeles', roll: '2026' }]);
    expect(r.json.counts).toEqual({ inside: 3, add: 3, skipRented: 0, skipType: 0, alreadyInCampaign: 0 });
    for (const h of r.json.homes) expect(h.ownerName).toBeNull();
    expect(r.json.homes.find((h: { unitOrder: string[] | null }) => h.unitOrder)).toMatchObject({ unitOrder: ['7', '8'], unitOwnerNames: {} });
    expect(r.json.homes.find((h: { address: string }) => h.address === '2212 1/2 Test Blvd')).toMatchObject({ homestead: false });
  });

  it('a Florida polygon is unchanged with states.json present', async () => {
    multi();
    const r = await call(body());
    expect(r.json.sources).toEqual([{ state: 'fl', county: 'duval', roll: '2026F' }]);
    expect(r.json.counts).toEqual({ inside: 6, add: 3, skipRented: 1, skipType: 2, alreadyInCampaign: 0 });
  });

  it('marks a Cook door already in the campaign by its id', async () => {
    multi();
    db.seed('houses', {
      [areaDoorId('solar', 'il-cook-17060000010000')]: { campaignId: 'solar', address: 'Elsewhere', city: 'Chicago', lat: IL_LAT + 0.004, lng: IL_LNG, packId: 'p', packName: 'P' },
    });
    const r = await call(body({ polygon: squareAt(IL_LAT, IL_LNG), ...OFF }));
    expect(r.json.counts.alreadyInCampaign).toBe(1);
    expect(r.json.homes.find((h: { id: string }) => h.id === areaDoorId('solar', 'il-cook-17060000010000')).status).toBe('already-in-campaign');
  });

  it('422 no_data_for_area: a Cook polygon before states.json exists, or where no picked state has a tile', async () => {
    multi(false);
    expect(await call(body({ polygon: squareAt(IL_LAT, IL_LNG) }))).toEqual({ status: 422, json: { error: 'no_data_for_area' } });
    resetTileCaches();
    multi();
    expect(await call(body({ polygon: squareAt(41.5, -88.2) }))).toEqual({ status: 422, json: { error: 'no_data_for_area' } });
    expect(await call(body({ polygon: squareAt(40, -100) }))).toEqual({ status: 422, json: { error: 'no_data_for_area' } });
  });

  it('503 tiles_unavailable when a picked state has no index', async () => {
    multi();
    storage.files.delete('parcels/ca/index.json');
    expect(await call(body({ polygon: squareAt(CA_LAT, CA_LNG) }))).toEqual({ status: 503, json: { error: 'tiles_unavailable' } });
  });
});
