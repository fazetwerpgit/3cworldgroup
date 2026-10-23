import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import type { FakeKnockDb } from '@/lib/knock/area/testing/fakeKnockDb';
import {
  CA_LAT,
  CA_LNG,
  IL_LAT,
  IL_LNG,
  LAT,
  LNG,
  MANAGER,
  OC_LAT,
  OC_LNG,
  OWNER,
  REAL_STATE_BOXES,
  REP,
  SQUARE,
  buildMultiStateFiles,
  buildMultiStateFilesWithOrange,
  buildTileFiles,
  createFakeStorage,
  postReq,
  squareAt,
  statesFile,
} from '@/lib/knock/area/testing/fixtures';

const db = adminDb as unknown as FakeKnockDb;
const storage = adminStorage as unknown as ReturnType<typeof createFakeStorage>;
const gate = requireVerifiedKnockCaller as unknown as ReturnType<typeof vi.fn>;

const PATH = '/api/portal/knock/area/import';
const ON = { housesOnly: true, ownerOccupiedOnly: true };
const OFF = { housesOnly: false, ownerOccupiedOnly: false };
const body = (over: Record<string, unknown> = {}) => ({ requestId: 'req-1', campaignId: 'solar', polygon: SQUARE, ...ON, ...over });

async function call(b: unknown, headers?: Record<string, string>) {
  const res = await POST(postReq(PATH, b, headers));
  return { status: res.status, json: await res.json() };
}
const houses = () => db.store.get('houses') ?? new Map<string, Record<string, unknown>>();
const record = (id = 'ai_req-1') => db.store.get('areaImports')?.get(id);

beforeEach(() => {
  process.env.PARCEL_TILES_BUCKET = 'tiles-bucket';
  db.store.clear();
  db.queries.length = 0;
  db.failNext.clear();
  // A test below swaps failNext.get for one id; put the Map's own method back.
  delete (db.failNext as unknown as { get?: unknown }).get;
  db.seed('campaigns', { solar: { name: 'Solar', type: 'solar' }, fiber: { name: 'Fiber', type: 'fiber' } });
  storage.files.clear();
  storage.setFailing(false);
  for (const [k, v] of buildTileFiles()) storage.files.set(k, v);
  resetTileCaches();
  gate.mockReset().mockResolvedValue(OWNER);
});

describe('POST /api/portal/knock/area/import: auth and validation', () => {
  it('401 unauthenticated', async () => {
    gate.mockResolvedValue({ ok: false, status: 401, error: 'Invalid authentication token' });
    expect(await call(body())).toMatchObject({ status: 401, json: { error: 'unauthenticated' } });
  });

  it('403 for a rep and for a manager off the campaign; nothing written', async () => {
    gate.mockResolvedValue(REP);
    expect(await call(body())).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    gate.mockResolvedValue(MANAGER);
    expect(await call(body({ campaignId: 'fiber' }))).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    expect(houses().size).toBe(0);
    expect(db.store.get('areaImports')).toBeUndefined();
  });

  it('a manager on the campaign imports', async () => {
    gate.mockResolvedValue(MANAGER);
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(r.json.area.createdBy).toEqual({ uid: 'mgr', name: 'Max Manager' });
  });

  it.each([
    ['a bad requestId', body({ requestId: 'has space' })],
    ['a requestId over 128 chars', body({ requestId: 'x'.repeat(129) })],
    ['no requestId and no header', body({ requestId: undefined })],
    ['a label over 60 chars', body({ label: 'L'.repeat(61) })],
    ['a blank label', body({ label: '   ' })],
    ['a numeric label', body({ label: 5 })],
    ['a missing housesOnly switch', body({ housesOnly: undefined })],
    ['a string ownerOccupiedOnly switch', body({ ownerOccupiedOnly: 'yes' })],
  ])('400 invalid_request for %s', async (_name, b) => {
    expect(await call(b)).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
  });

  it('400 invalid_polygon', async () => {
    expect(await call(body({ polygon: SQUARE.slice(0, 2) }))).toMatchObject({ status: 400, json: { error: 'invalid_polygon' } });
  });

  it('404 campaign_not_found', async () => {
    expect(await call(body({ campaignId: 'gone' }))).toMatchObject({ status: 404, json: { error: 'campaign_not_found' } });
  });

  it('takes the requestId from Idempotency-Key when the body has none; the body wins when both are sent', async () => {
    expect((await call(body({ requestId: undefined }), { 'idempotency-key': 'hdr-1' })).json.areaImportId).toBe('ai_hdr-1');
    expect((await call(body({ requestId: 'body-1', ...OFF }), { 'idempotency-key': 'hdr-2' })).json.areaImportId).toBe('ai_body-1');
  });
});

describe('POST /api/portal/knock/area/import: writing', () => {
  it('writes the add doors with the import fields and records the area', async () => {
    const r = await call(body({ label: '  Riverside  ' }));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      areaImportId: 'ai_req-1',
      duplicate: false,
      added: 3,
      counts: { inside: 6, add: 3, skipRented: 1, skipType: 2, alreadyInCampaign: 0 },
      area: {
        areaImportId: 'ai_req-1',
        campaignId: 'solar',
        label: 'Riverside',
        doorCount: 3,
        createdBy: { uid: 'own', name: 'Olive Owner' },
        housesOnly: true,
        ownerOccupiedOnly: true,
        polygon: SQUARE,
      },
    });
    expect(r.json.packs.reduce((n: number, p: { count: number }) => n + p.count, 0)).toBe(3);
    expect([...houses().keys()].sort()).toEqual(['26-0001', '26-0003', '26-0007'].map((p) => areaDoorId('solar', p)).sort());
    const door = houses().get(areaDoorId('solar', '26-0001'))!;
    expect(door).toMatchObject({
      campaignId: 'solar',
      address: '101 Oak St',
      city: 'Jacksonville',
      lat: LAT + 0.001,
      lng: LNG + 0.001,
      assignedRepId: null,
      managerId: null,
      last: null,
      notHomeCount: 0,
      unitOrder: null,
      units: null,
      movedBy: null,
      createdBy: null,
      ownerOccupied: true,
      propertyType: 'single-family',
      areaImportId: 'ai_req-1',
      homestead: true,
      useType: '001',
      ownerName: 'Smith John A',
    });
    expect(door).not.toHaveProperty('id');
    expect(Object.values(door).includes(undefined)).toBe(false);
    expect(houses().get(areaDoorId('solar', '26-0003'))).toMatchObject({ propertyType: 'mobile-home', useType: '002' });
    expect(record()).toMatchObject({
      status: 'done',
      requestId: 'req-1',
      label: 'Riverside',
      doorCount: 3,
      createdBy: 'own',
      createdByName: 'Olive Owner',
      sources: [{ state: 'fl', county: 'duval', roll: '2026F' }],
      result: { ...r.json, duplicate: false },
      removedAt: null,
    });
    expect(typeof record()!.finishedAt).toBe('number');
  });

  it('with the switches off writes the condo building as one MDU door', async () => {
    const r = await call(body(OFF));
    expect(r.json.added).toBe(6);
    const mdu = [...houses().values()].find((h) => Array.isArray(h.unitOrder))!;
    expect(mdu).toMatchObject({ address: '500 Bay St', unitOrder: ['101', '102'], units: {}, propertyType: 'condo', useType: '004', homestead: false, unitOwnerNames: { '101': 'Unit One Owner' } });
    expect(mdu).not.toHaveProperty('ownerName');
  });

  it('default label is "Area <n>"', async () => {
    db.seed('areaImports', { ai_old: { campaignId: 'solar', status: 'done', createdAt: 1, packs: [] }, ai_x: { campaignId: 'fiber', status: 'done', createdAt: 1 } });
    expect((await call(body())).json.area.label).toBe('Area 2');
  });

  it('skips doors already in the campaign and never overwrites one', async () => {
    const id = areaDoorId('solar', '26-0001');
    db.seed('houses', { [id]: { campaignId: 'solar', address: '101 Oak St', city: 'Jacksonville', lat: LAT + 0.001, lng: LNG + 0.001, packId: 'mine', packName: 'Mine', last: { dispositionId: 'x' } } });
    const r = await call(body());
    expect(r.json.counts.alreadyInCampaign).toBe(1);
    expect(r.json.added).toBe(2);
    expect(houses().get(id)).toMatchObject({ packId: 'mine', last: { dispositionId: 'x' } });
    expect(houses().get(id)).not.toHaveProperty('areaImportId');
  });

  it("never adds, rewrites or restores a door soft-deleted from the campaign; another campaign's deleted door does not block", async () => {
    const stamp = (campaignId: string) => ({ by: 'rep', at: 5, campaignId });
    const seeded = {
      [areaDoorId('solar', '26-0001')]: { campaignId: '_deleted', deleted: stamp('solar'), address: '101 Oak St', city: 'Jacksonville', lat: LAT + 0.001, lng: LNG + 0.001, notHomeCount: 1, last: { dispositionId: 'not_home' } },
      repDropped: { campaignId: '_deleted', deleted: stamp('solar'), address: '104 Oak St', city: 'Jacksonville', lat: LAT + 0.0045, lng: LNG + 0.001, notHomeCount: 1 },
      otherGone: { campaignId: '_deleted', deleted: stamp('fiber'), address: '103 Oak St', city: 'Jacksonville', lat: LAT + 0.002, lng: LNG + 0.001 },
    };
    db.seed('houses', structuredClone(seeded));
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(r.json.counts).toEqual({ inside: 6, add: 1, skipRented: 1, skipType: 2, alreadyInCampaign: 2 });
    expect(r.json.added).toBe(1);
    expect(houses().get(areaDoorId('solar', '26-0003'))).toMatchObject({ campaignId: 'solar', areaImportId: 'ai_req-1' });
    expect(houses().has(areaDoorId('solar', '26-0007'))).toBe(false);
    for (const [id, doc] of Object.entries(seeded)) expect(houses().get(id)).toEqual(doc);
    expect(houses().size).toBe(4);
  });

  it('a door created between the plan and the write (ALREADY_EXISTS) is left as it is', async () => {
    db.failNext.set(`houses/${areaDoorId('solar', '26-0003')}`, 6);
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(r.json.added).toBe(2);
    expect(record()!.status).toBe('done');
  });

  it('422 nothing_to_add (with counts) drops the writing record', async () => {
    const polygon = [
      { lat: LAT + 0.0013, lng: LNG + 0.0005 },
      { lat: LAT + 0.0013, lng: LNG + 0.0015 },
      { lat: LAT + 0.0017, lng: LNG + 0.001 },
    ];
    const r = await call(body({ polygon }));
    expect(r).toEqual({ status: 422, json: { error: 'nothing_to_add', counts: { inside: 1, add: 0, skipRented: 1, skipType: 0, alreadyInCampaign: 0 } } });
    expect(record()).toBeUndefined();
    // The same requestId can then be used again.
    expect((await call(body())).status).toBe(200);
  });

  it('422 too_big and 503 drop the writing record', async () => {
    const big = [{ lat: 30, lng: -82 }, { lat: 30, lng: -81 }, { lat: 31, lng: -81 }];
    expect(await call(body({ polygon: big }))).toMatchObject({ status: 422, json: { error: 'too_big', inside: null } });
    expect(record()).toBeUndefined();
    storage.setFailing(true);
    expect(await call(body())).toMatchObject({ status: 503, json: { error: 'tiles_unavailable' } });
    expect(record()).toBeUndefined();
  });

  it('new doors reuse the pack names of earlier area imports', async () => {
    const first = await call(body({ requestId: 'a', ...OFF, polygon: [
      { lat: LAT + 0.0005, lng: LNG + 0.0005 }, { lat: LAT + 0.0005, lng: LNG + 0.0015 }, { lat: LAT + 0.0012, lng: LNG + 0.001 },
    ] }));
    expect(first.json.added).toBe(1);
    const second = await call(body({ requestId: 'b', ...OFF }));
    const pack = first.json.packs[0];
    const again = second.json.packs.find((p: { packId: string }) => p.packId === pack.packId);
    expect(again?.name).toBe(pack.name);
  });
});

describe('POST /api/portal/knock/area/import: idempotency', () => {
  it('a retry replays the stored result with duplicate: true and writes nothing', async () => {
    const first = await call(body());
    const before = houses().size;
    const again = await call(body({ polygon: SQUARE.map((p) => ({ lat: p.lat + 0.001, lng: p.lng })), ...OFF }));
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ ...first.json, duplicate: true });
    expect(houses().size).toBe(before);
  });

  it('a removed area replays too', async () => {
    const first = await call(body());
    db.store.get('areaImports')!.set('ai_req-1', { ...record()!, status: 'removed' });
    expect((await call(body())).json).toEqual({ ...first.json, duplicate: true });
  });

  it('409 request_id_conflict for another user or another campaign', async () => {
    await call(body());
    gate.mockResolvedValue(MANAGER);
    expect(await call(body())).toMatchObject({ status: 409, json: { error: 'request_id_conflict' } });
    gate.mockResolvedValue(OWNER);
    expect(await call(body({ campaignId: 'fiber' }))).toMatchObject({ status: 409, json: { error: 'request_id_conflict' } });
  });

  it('409 import_in_progress while a fresh attempt is writing', async () => {
    db.seed('areaImports', { 'ai_req-1': { campaignId: 'solar', createdBy: 'own', status: 'writing', startedAt: Date.now() - 5_000, createdAt: Date.now() - 5_000 } });
    expect(await call(body())).toEqual({ status: 409, json: { error: 'import_in_progress', retryAfterMs: 2000 } });
  });

  it('resumes a stale attempt (>= 120 s) from the first polygon, writing only the missing doors', async () => {
    const createdAt = Date.now() - 200_000;
    const partial = areaDoorId('solar', '26-0001');
    db.seed('areaImports', {
      'ai_req-1': {
        campaignId: 'solar', requestId: 'req-1', label: 'First', polygon: SQUARE, ...ON, status: 'writing',
        createdBy: 'own', createdByName: 'Olive Owner', createdAt, startedAt: createdAt, finishedAt: null,
        doorCount: 0, counts: null, packs: [], sources: [], result: null,
        removedAt: null, removedBy: null, removedCount: null, keptCount: null,
      },
    });
    db.seed('houses', { [partial]: { campaignId: 'solar', address: '101 Oak St', city: 'Jacksonville', lat: LAT + 0.001, lng: LNG + 0.001, packId: 'area-32207-0_0', packName: '32207 Jacksonville 1', areaImportId: 'ai_req-1' } });
    // The retry sends other switches: the first call's win.
    const r = await call(body(OFF));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ added: 3, duplicate: false, area: { label: 'First', createdAt, housesOnly: true } });
    expect(r.json.counts).toEqual({ inside: 6, add: 2, skipRented: 1, skipType: 2, alreadyInCampaign: 1 });
    expect(record()!.status).toBe('done');
  });

  it('a resume whose doors were all written finishes (nothing_to_add is not an error then)', async () => {
    const createdAt = Date.now() - 200_000;
    db.seed('areaImports', {
      'ai_req-1': { campaignId: 'solar', requestId: 'req-1', label: 'First', polygon: SQUARE, ...ON, status: 'writing', createdBy: 'own', createdByName: 'Olive Owner', createdAt, startedAt: createdAt, packs: [] },
    });
    db.seed('houses', Object.fromEntries(['26-0001', '26-0003', '26-0007'].map((p, i) => [areaDoorId('solar', p), {
      campaignId: 'solar', address: `${101 + i * 2} Oak St`, city: 'Jacksonville', lat: LAT + 0.001 * (i + 1), lng: LNG + 0.001, areaImportId: 'ai_req-1', packId: 'p', packName: 'P',
    }])));
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(r.json.added).toBe(3);
    expect(record()!.status).toBe('done');
  });

  it('a failed write leaves the record writing so a later retry resumes it', async () => {
    db.failNext.set(`houses/${areaDoorId('solar', '26-0003')}`, 13);
    // 13 INTERNAL is retried by the writer; fail it every time.
    const id = `houses/${areaDoorId('solar', '26-0003')}`;
    const orig = db.failNext.get.bind(db.failNext);
    db.failNext.get = (k: string) => (k === id ? 13 : orig(k));
    const r = await call(body());
    expect(r).toEqual({ status: 500, json: { error: 'internal' } });
    expect(record()!.status).toBe('writing');
  });
});

describe('POST /api/portal/knock/area/import: Illinois and California tiles', () => {
  beforeEach(() => {
    storage.files.clear();
    for (const [k, v] of buildMultiStateFiles()) storage.files.set(k, v);
    storage.files.set(...statesFile(REAL_STATE_BOXES));
  });

  it('imports Los Angeles doors without owner names; sources carry the state', async () => {
    const r = await call(body({ requestId: 'la-1', polygon: squareAt(CA_LAT, CA_LNG), ...OFF }));
    expect(r.status).toBe(200);
    expect(r.json.added).toBe(3);
    const door = houses().get(areaDoorId('solar', 'ca-los-angeles-5070000001'))!;
    expect(door).toMatchObject({ address: '2212 Test Blvd', city: 'Los Angeles', areaImportId: 'ai_la-1', useType: '001', homestead: true });
    expect(door).not.toHaveProperty('ownerName');
    const mdu = houses().get(areaDoorId('solar', 'ca-los-angeles-5070000101', true))!;
    expect(mdu).toMatchObject({ unitOrder: ['7', '8'], propertyType: 'condo' });
    expect(mdu).not.toHaveProperty('unitOwnerNames');
    expect(record('ai_la-1')).toMatchObject({ status: 'done', sources: [{ state: 'ca', county: 'los-angeles', roll: '2026' }] });
  });

  it('imports Cook doors by PIN ids; a second Cook import of the same area is nothing_to_add', async () => {
    const r = await call(body({ requestId: 'il-1', polygon: squareAt(IL_LAT, IL_LNG), ...OFF }));
    expect(r.json.added).toBe(3);
    expect(houses().get(areaDoorId('solar', 'il-cook-17060000010000'))).toMatchObject({ ownerName: 'Pat Sample', ownerOccupied: true });
    expect(houses().get(areaDoorId('solar', 'il-cook-17060000020000'))).toMatchObject({ ownerOccupied: false, propertyType: 'multi-family' });
    expect(record('ai_il-1')).toMatchObject({ sources: [{ state: 'il', county: 'cook', roll: '2026' }] });
    const again = await call(body({ requestId: 'il-2', polygon: squareAt(IL_LAT, IL_LNG), ...OFF }));
    expect(again).toMatchObject({ status: 422, json: { error: 'nothing_to_add', counts: { inside: 3, alreadyInCampaign: 3 } } });
  });

  it('a Florida import next to them is unchanged', async () => {
    const r = await call(body());
    expect(r).toMatchObject({ status: 200, json: { added: 3 } });
    expect(record()).toMatchObject({ sources: [{ state: 'fl', county: 'duval', roll: '2026F' }] });
  });
});

describe('POST /api/portal/knock/area/import: counties without an owner-occupied signal (Orange, CA)', () => {
  beforeEach(() => {
    storage.files.clear();
    for (const [k, v] of buildMultiStateFilesWithOrange()) storage.files.set(k, v);
    storage.files.set(...statesFile(REAL_STATE_BOXES));
  });

  it('imports Orange doors with Owner-occupied only on, without an ownerOccupied field', async () => {
    const r = await call(body({ requestId: 'oc-1', polygon: squareAt(OC_LAT, OC_LNG) }));
    expect(r).toMatchObject({ status: 200, json: { added: 2, counts: { inside: 4, add: 2, skipRented: 0, skipType: 2 } } });
    for (const apn of ['10000001', '10000002']) {
      const door = houses().get(areaDoorId('solar', `ca-orange-${apn}`))!;
      expect(door).toMatchObject({ areaImportId: 'ai_oc-1', homestead: false, propertyType: 'single-family' });
      expect(door).not.toHaveProperty('ownerOccupied');
    }
    expect(record('ai_oc-1')!.sources).toEqual([{ state: 'ca', county: 'orange', roll: '2026', ownerOccupied: 'none' }]);
  });

  it('a Los Angeles + Orange import skips only the Los Angeles renters and keeps ownerOccupied on LA doors', async () => {
    const r = await call(body({ requestId: 'mix-1', polygon: squareAt(CA_LAT, CA_LNG) }));
    expect(r).toMatchObject({ status: 200, json: { added: 2, counts: { inside: 4, add: 2, skipRented: 1, skipType: 1 } } });
    expect(houses().get(areaDoorId('solar', 'ca-los-angeles-5070000001'))).toMatchObject({ ownerOccupied: true, homestead: true });
    expect(houses().has(areaDoorId('solar', 'ca-los-angeles-5070000002'))).toBe(false);
    expect(houses().get(areaDoorId('solar', 'ca-orange-20000001'))).not.toHaveProperty('ownerOccupied');
    expect(record('ai_mix-1')!.sources).toEqual([
      { state: 'ca', county: 'los-angeles', roll: '2026', ownerOccupied: 'exemption' },
      { state: 'ca', county: 'orange', roll: '2026', ownerOccupied: 'none' },
    ]);
  });

  it('Florida doors keep ownerOccupied; sources resolve the Florida default', async () => {
    const r = await call(body());
    expect(r).toMatchObject({ status: 200, json: { added: 3 } });
    expect(houses().get(areaDoorId('solar', '26-0001'))).toMatchObject({ ownerOccupied: true });
    expect(record()!.sources).toEqual([{ state: 'fl', county: 'duval', roll: '2026F', ownerOccupied: 'exemption' }]);
  });
});

describe('POST /api/portal/knock/area/import: an omitted ownerOccupiedOnly is false', () => {
  it('imports renters too and stores ownerOccupiedOnly false', async () => {
    const r = await call(body({ requestId: 'omit-1', ownerOccupiedOnly: undefined }));
    expect(r).toMatchObject({ status: 200, json: { added: 4, counts: { skipRented: 0 }, area: { ownerOccupiedOnly: false } } });
    expect(houses().get(areaDoorId('solar', '26-0002'))).toMatchObject({ ownerOccupied: false });
    expect(record('ai_omit-1')).toMatchObject({ ownerOccupiedOnly: false });
  });
});
