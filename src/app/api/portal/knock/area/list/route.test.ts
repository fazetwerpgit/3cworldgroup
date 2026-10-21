import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/knock/area/testing/fakeKnockDb')).createFakeKnockDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedKnockCaller: vi.fn() }));

import { GET } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedKnockCaller } from '@/lib/auth/requireVerifiedAdmin';
import type { FakeKnockDb } from '@/lib/knock/area/testing/fakeKnockDb';
import { MANAGER, OWNER, REP, SQUARE, getReq } from '@/lib/knock/area/testing/fixtures';

const db = adminDb as unknown as FakeKnockDb;
const gate = requireVerifiedKnockCaller as unknown as ReturnType<typeof vi.fn>;

async function call(query: string) {
  const res = await GET(getReq(`/api/portal/knock/area/list${query}`));
  return { status: res.status, json: await res.json() };
}

const area = (over: Record<string, unknown>) => ({
  campaignId: 'solar',
  label: 'Area',
  polygon: SQUARE,
  housesOnly: true,
  ownerOccupiedOnly: false,
  status: 'done',
  createdBy: 'own',
  createdByName: 'Olive Owner',
  createdAt: 1000,
  ...over,
});

beforeEach(() => {
  db.store.clear();
  db.queries.length = 0;
  db.seed('campaigns', { solar: { type: 'solar' }, fiber: { type: 'fiber' } });
  db.seed('areaImports', {
    ai_a: area({ label: 'Old', createdAt: 1000 }),
    ai_b: area({ label: 'New', createdAt: 3000, createdBy: 'mgr', createdByName: 'Max Manager' }),
    ai_w: area({ label: 'Writing', status: 'writing', createdAt: 4000 }),
    ai_r: area({ label: 'Removed', status: 'removed', createdAt: 5000 }),
    ai_f: area({ label: 'Fiber', campaignId: 'fiber', createdAt: 2000 }),
  });
  db.seed('houses', {
    h1: { campaignId: 'solar', areaImportId: 'ai_a' },
    h2: { campaignId: 'solar', areaImportId: 'ai_a' },
    h3: { campaignId: 'solar', areaImportId: 'ai_b' },
    h4: { campaignId: 'solar' },
  });
  gate.mockReset().mockResolvedValue(OWNER);
});

describe('GET /api/portal/knock/area/list', () => {
  it('lists the done areas newest first with live door counts', async () => {
    const r = await call('?campaignId=solar');
    expect(r.status).toBe(200);
    expect(r.json.areas).toEqual([
      {
        areaImportId: 'ai_b',
        campaignId: 'solar',
        label: 'New',
        doorCount: 1,
        createdAt: 3000,
        createdBy: { uid: 'mgr', name: 'Max Manager' },
        housesOnly: true,
        ownerOccupiedOnly: false,
        polygon: SQUARE,
      },
      expect.objectContaining({ areaImportId: 'ai_a', label: 'Old', doorCount: 2, createdBy: { uid: 'own', name: 'Olive Owner' } }),
    ]);
  });

  it('[] for a campaign with no areas', async () => {
    db.store.get('areaImports')!.clear();
    expect(await call('?campaignId=solar')).toEqual({ status: 200, json: { areas: [] } });
  });

  it('a manager lists a campaign they are on, including areas others added', async () => {
    gate.mockResolvedValue(MANAGER);
    expect((await call('?campaignId=solar')).json.areas).toHaveLength(2);
    expect(await call('?campaignId=fiber')).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
  });

  it('401, 403 rep, 400 no campaignId, 404 campaign_not_found', async () => {
    gate.mockResolvedValue({ ok: false, status: 401, error: 'Missing authentication token' });
    expect(await call('?campaignId=solar')).toMatchObject({ status: 401, json: { error: 'unauthenticated' } });
    gate.mockResolvedValue(REP);
    expect(await call('?campaignId=solar')).toMatchObject({ status: 403, json: { error: 'not_allowed' } });
    gate.mockResolvedValue(OWNER);
    expect(await call('')).toMatchObject({ status: 400, json: { error: 'invalid_request' } });
    expect(await call('?campaignId=nope')).toMatchObject({ status: 404, json: { error: 'campaign_not_found' } });
  });
});
