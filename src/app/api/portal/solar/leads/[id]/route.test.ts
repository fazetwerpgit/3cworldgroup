import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { PATCH } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false, solarRole: 'ae_canvasser' };

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/portal/solar/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { solarRole: 'ae_canvasser' },
    rep2: { solarRole: 'ae_canvasser' },
    adm: { role: 'admin' },
    fiber: { fieldRole: 'ae_tier_1' },
  })));
  db.store.set('solarLeads', new Map([['rep1_c1', { repUid: 'rep1', first: 'Ana', creditTier: null }]]));
  mockGate.mockReset().mockResolvedValue(REP);
});

describe('PATCH /api/portal/solar/leads/[id]', () => {
  it('lets the creator set creditTier', async () => {
    const res = await patch('rep1_c1', { creditTier: 'lease_ppa_680' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 'rep1_c1' });
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.creditTier).toBe('lease_ppa_680');
  });

  it('lets an admin set it', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(200);
  });

  it('403s another solar rep', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(403);
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.creditTier).toBeNull();
  });

  it('403s a caller without solar access', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber', fieldRole: 'ae_tier_1', solarRole: null });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(403);
  });

  it('401s without a token', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(401);
  });

  it('400s on a bad tier and 404s on a missing lead', async () => {
    expect((await patch('rep1_c1', { creditTier: 'gold' })).status).toBe(400);
    expect((await patch('nope', { creditTier: 'purchase_600' })).status).toBe(404);
  });
});
