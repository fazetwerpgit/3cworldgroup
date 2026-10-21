import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/knock/area/testing/fakeKnockDb')).createFakeKnockDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedKnockCaller: vi.fn() }));

import { POST } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedKnockCaller } from '@/lib/auth/requireVerifiedAdmin';
import type { FakeKnockDb } from '@/lib/knock/area/testing/fakeKnockDb';
import { MANAGER, OWNER, REP, postReq } from '@/lib/knock/area/testing/fixtures';

const db = adminDb as unknown as FakeKnockDb;
const gate = requireVerifiedKnockCaller as unknown as ReturnType<typeof vi.fn>;

async function call(b: unknown) {
  const res = await POST(postReq('/api/portal/knock/area/remove', b));
  return { status: res.status, json: await res.json() };
}
const body = (over: Record<string, unknown> = {}) => ({ campaignId: 'solar', areaImportId: 'ai_a', dryRun: false, ...over });
const door = (over: Record<string, unknown> = {}) => ({
  campaignId: 'solar',
  areaImportId: 'ai_a',
  assignedRepId: null,
  managerId: null,
  last: null,
  notHomeCount: 0,
  unitOrder: null,
  units: null,
  ...over,
});
const houses = () => db.store.get('houses')!;

beforeEach(() => {
  db.store.clear();
  db.failNext.clear();
  db.seed('campaigns', { solar: { type: 'solar' }, fiber: { type: 'fiber' } });
  db.seed('areaImports', {
    ai_a: { campaignId: 'solar', status: 'done', createdAt: 1000, createdBy: 'own' },
    ai_w: { campaignId: 'solar', status: 'writing', createdAt: 1000, createdBy: 'own' },
    ai_f: { campaignId: 'fiber', status: 'done', createdAt: 1000, createdBy: 'own' },
  });
  db.seed('houses', {
    clean: door(),
    assigned: door({ assignedRepId: 'rep', managerId: 'mgr' }),
    knocked: door(),
    resetByLasso: door(),
    result: door({ last: { dispositionId: 'nh' } }),
    visited: door({ notHomeCount: 1 }),
    imported: door({ importedMark: { dispositionId: 'x' } }),
    noted: door({ doorNote: { text: 'dog', by: 'r', at: 1 } }),
    unitNoted: door({ unitOrder: ['1'], units: {}, unitNotes: { '1': { text: 'x', by: 'r', at: 1 } } }),
    unitResult: door({ unitOrder: ['1', '2'], units: { '2': { last: { dispositionId: 'y' }, notHomeCount: 0 } } }),
    noSoliciting: door({ noSoliciting: { at: 1, by: 'r' } }),
    cleanMdu: door({ unitOrder: ['1', '2'], units: {} }),
    otherArea: door({ areaImportId: 'ai_other' }),
    carrier: { campaignId: 'solar', last: null, notHomeCount: 0 },
  });
  db.seed('knocks', {
    k1: { campaignId: 'solar', houseId: 'knocked', createdAt: 2000 },
    k2: { campaignId: 'solar', houseId: 'resetByLasso', createdAt: 2500, dispositionId: '__reset__', bulk: true },
    k3: { campaignId: 'solar', houseId: 'clean', createdAt: 500 },
    k4: { campaignId: 'fiber', houseId: 'cleanMdu', createdAt: 2000 },
  });
  gate.mockReset().mockResolvedValue(OWNER);
});

describe('POST /api/portal/knock/area/remove', () => {
  it('dryRun counts the untouched doors and writes nothing', async () => {
    const before = houses().size;
    expect(await call(body({ dryRun: true }))).toEqual({ status: 200, json: { removable: 3, kept: 9 } });
    expect(houses().size).toBe(before);
    expect(db.store.get('areaImports')!.get('ai_a')!.status).toBe('done');
  });

  it('deletes only the untouched doors of the area and marks the record removed', async () => {
    expect(await call(body())).toEqual({ status: 200, json: { removed: 3, kept: 9 } });
    for (const id of ['clean', 'assigned', 'cleanMdu']) expect(houses().has(id)).toBe(false);
    for (const id of ['knocked', 'resetByLasso', 'result', 'visited', 'imported', 'noted', 'unitNoted', 'unitResult', 'noSoliciting', 'otherArea', 'carrier']) {
      expect(houses().has(id)).toBe(true);
    }
    expect(houses().get('knocked')!.areaImportId).toBe('ai_a');
    expect(db.store.get('areaImports')!.get('ai_a')).toMatchObject({ status: 'removed', removedBy: 'own', removedCount: 3, keptCount: 9 });
    expect(typeof db.store.get('areaImports')!.get('ai_a')!.removedAt).toBe('number');
  });

  it('is idempotent: a second call removes 0 and keeps the first record', async () => {
    await call(body());
    const first = { ...db.store.get('areaImports')!.get('ai_a')! };
    expect(await call(body())).toEqual({ status: 200, json: { removed: 0, kept: 9 } });
    expect(db.store.get('areaImports')!.get('ai_a')).toEqual(first);
  });

  it('a door changed after the read (FAILED_PRECONDITION) is kept', async () => {
    db.failNext.set('houses/assigned', 9);
    expect(await call(body())).toEqual({ status: 200, json: { removed: 2, kept: 10 } });
    expect(houses().has('assigned')).toBe(true);
  });

  it('404 area_not_found for a missing area or one of another campaign', async () => {
    expect(await call(body({ areaImportId: 'ai_missing' }))).toMatchObject({ status: 404, json: { error: 'area_not_found' } });
    expect(await call(body({ areaImportId: 'ai_f' }))).toMatchObject({ status: 404, json: { error: 'area_not_found' } });
  });

  it('409 import_in_progress while the area is being written', async () => {
    expect(await call(body({ areaImportId: 'ai_w' }))).toEqual({ status: 409, json: { error: 'import_in_progress', retryAfterMs: 2000 } });
  });

  it('auth, role, body and campaign errors', async () => {
    gate.mockResolvedValue({ ok: false, status: 401, error: 'x' });
    expect(await call(body())).toMatchObject({ status: 401, json: { error: 'unauthenticated' } });
    gate.mockResolvedValue(REP);
    expect(await call(body())).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    gate.mockResolvedValue(MANAGER);
    expect(await call(body({ campaignId: 'fiber', areaImportId: 'ai_f' }))).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    expect(await call(body({ dryRun: 'yes' }))).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
    expect(await call(body({ areaImportId: '' }))).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
    expect(await call(body({ campaignId: 'gone' }))).toMatchObject({ status: 404, json: { error: 'campaign_not_found' } });
    expect((await call(body({ dryRun: true }))).status).toBe(200);
  });
});
