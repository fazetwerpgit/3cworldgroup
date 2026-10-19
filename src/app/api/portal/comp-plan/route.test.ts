import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-auth gates so we control who the caller is.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(),
  requireVerifiedManagement: vi.fn(),
}));

vi.mock('@/lib/auth/viewAs', async () => (await import('@/lib/auth/viewAsTestStub')).viewAsStubModule());

// config/compPlan and config/compPlanMargin are absent by default, so the route
// falls back to the committed module — the pre-seed state.
const docs = new Map<string, Record<string, unknown>>();
const users: Array<{ id: string; fieldRole?: string; role?: string }> = [
  { id: 'rep1', fieldRole: 'ae_tier_1' },
  { id: 'boss', role: 'admin' },
  { id: 'nobody' },
];
const setSpy = vi.fn();
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({ exists: docs.has(id), data: () => docs.get(id) })),
        set: vi.fn(async (value: unknown) => setSpy(id, value)),
      })),
      select: vi.fn(() => ({
        get: vi.fn(async () => ({
          docs: users.map((user) => ({ id: user.id, get: (field: 'fieldRole' | 'role') => user[field] })),
        })),
      })),
    })),
  },
}));

import type * as AdminAuditModule from '@/lib/audit/adminAudit';

vi.mock('@/lib/audit/adminAudit', async (importOriginal) => ({
  ...(await importOriginal<typeof AdminAuditModule>()),
  writeAdminAudit: vi.fn(async () => undefined),
}));

import { writeAdminAudit } from '@/lib/audit/adminAudit';
import { GET, PUT } from './route';
import {
  requireVerifiedManagement,
  requireVerifiedRequester,
} from '@/lib/auth/requireVerifiedAdmin';
import { COMP_PLAN_RATES } from '@/data/compPlan.generated';
import { viewAsHeaders } from '@/lib/auth/viewAsTestStub';

const mockRequester = requireVerifiedRequester as unknown as ReturnType<typeof vi.fn>;
const mockManagement = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;

function get() {
  return new NextRequest('http://localhost/api/portal/comp-plan');
}
// The editor echoes the updatedAt it loaded; null is the pre-seed state.
function put(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/comp-plan', {
    method: 'PUT',
    body: JSON.stringify({ baseUpdatedAt: null, ...body }),
  });
}

beforeEach(() => {
  mockRequester.mockReset();
  mockManagement.mockReset();
  setSpy.mockClear();
  docs.clear();
  vi.mocked(writeAdminAudit).mockClear();
});

describe('GET /api/portal/comp-plan', () => {
  it('rejects an unauthenticated caller', async () => {
    mockRequester.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it('gives a rep only their own role slice, with no margin', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'u1', name: 'Rep', email: 'rep@x.com',
      fieldRole: 'ae_tier_1', isManagement: false, isAdmin: false, isManagerOrAbove: false,
    });
    const json = await (await GET(get())).json();
    expect(json.scope).toBe('own');
    expect(json.compRole).toBe('ae_tier_1');
    expect(json.rates).toEqual(COMP_PLAN_RATES.ae_tier_1);
    expect(json.rates.att['att-1gig']).toBe(150);
    expect(json.payDelayDays).toBe(14);
    expect('margin' in json).toBe(false);
    // No other role's numbers are anywhere in the payload.
    expect(json.rates.ae_tier_2).toBeUndefined();
  });

  it('resolves a legacy field role to the AE Tier 1 slice', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'u2', name: 'Old Rep', email: 'old@x.com',
      fieldRole: 'entry_rep', isManagement: false, isAdmin: false, isManagerOrAbove: false,
    });
    const json = await (await GET(get())).json();
    expect(json.compRole).toBe('ae_tier_1');
    expect(json.rates).toEqual(COMP_PLAN_RATES.ae_tier_1);
  });

  it('returns null rates for a field user with no comp plan role', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'u3', name: 'No Role', email: 'none@x.com',
      isManagement: false, isAdmin: false, isManagerOrAbove: false,
    });
    const json = await (await GET(get())).json();
    expect(json.rates).toBeNull();
    expect(json.compRole).toBeNull();
  });

  it('gives an admin every role but never the margin', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'a1', name: 'Admin', email: 'a@x.com',
      role: 'admin', isManagement: true, isAdmin: true, isManagerOrAbove: true,
    });
    const json = await (await GET(get())).json();
    expect(json.scope).toBe('all');
    expect(Object.keys(json.rates)).toContain('director');
    expect('margin' in json).toBe(false);
    expect('repCompRoles' in json).toBe(false);
  });

  it('gives an admin their own Internal Rep slice alongside the full table', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'a1', name: 'Admin', email: 'a@x.com',
      role: 'admin', isManagement: true, isAdmin: true, isManagerOrAbove: true,
    });
    const json = await (await GET(get())).json();
    expect(json.compRole).toBe('internal_rep');
    // Company -> plan -> dollars, not the role-keyed table.
    expect(json.ownRates.att['att-1gig']).toBe(400);
    expect(json.ownRates).toEqual(json.rates.internal_rep);
  });

  it('gives operations its own T-Fiber slice and never the margin', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'op1', name: 'Ops', email: 'op@x.com',
      role: 'operations', isManagement: true, isAdmin: false, isManagerOrAbove: true,
    });
    const json = await (await GET(get())).json();
    expect(json.compRole).toBe('operations');
    expect(json.ownRates).toEqual({ tfiber: { 'tfiber-1gig': 280, 'tfiber-2gig': 302, 'tfiber-300': 100 } });
    expect('margin' in json).toBe(false);
  });

  it('never gives a rep the operations slice, even with a stray operations field role', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'r9', name: 'Rep', email: 'r@x.com',
      fieldRole: 'operations', isManagement: false, isAdmin: false, isManagerOrAbove: false,
    });
    const json = await (await GET(get())).json();
    expect(json.scope).toBe('own');
    expect(json.compRole).toBeNull();
    expect(json.rates).toBeNull();
  });

  it('gives the owner the margin and each user\'s pay role', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'o1', name: 'Owner', email: 'o@x.com',
      role: 'owner', isManagement: true, isAdmin: true, isManagerOrAbove: true,
    });
    const json = await (await GET(get())).json();
    expect(json.scope).toBe('all');
    expect(json.margin.att['att-1gig']).toBe(500);
    expect(json.repCompRoles).toEqual({ rep1: 'ae_tier_1', boss: 'internal_rep' });
  });
});

describe('PUT /api/portal/comp-plan', () => {
  const VALID = { rates: { ae_tier_1: { att: { 'att-1gig': 175 } } } };

  it('refuses an admin who is not the owner', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'a1', name: 'Admin', isAdmin: true, isOwner: false });
    const res = await PUT(put(VALID));
    expect(res.status).toBe(403);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('refuses a non-management caller', async () => {
    mockManagement.mockResolvedValue({ ok: false, error: 'Forbidden: management access required', status: 403 });
    const res = await PUT(put(VALID));
    expect(res.status).toBe(403);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown role', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await PUT(put({ rates: { entry_rep: { att: { 'att-1gig': 1 } } } }));
    expect(res.status).toBe(400);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('keeps the operations table through a full-plan save', async () => {
    // The owner editor PUTs back the whole table it fetched.
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await PUT(put({ rates: COMP_PLAN_RATES }));
    expect(res.status).toBe(200);
    const [, saved] = setSpy.mock.calls[0];
    expect(saved.rates.operations).toEqual({ tfiber: { 'tfiber-1gig': 280, 'tfiber-2gig': 302, 'tfiber-300': 100 } });
    expect(Object.keys(saved.rates).sort()).toEqual(Object.keys(COMP_PLAN_RATES).sort());
  });

  it('rejects a negative or non-numeric rate', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    expect((await PUT(put({ rates: { ae_tier_1: { att: { 'att-1gig': -5 } } } }))).status).toBe(400);
    expect((await PUT(put({ rates: { ae_tier_1: { att: { 'att-1gig': '150' } } } }))).status).toBe(400);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('writes rates for the owner, and margin to its own doc', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await PUT(put({ ...VALID, margin: { att: { 'att-1gig': 520 } } }));
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledTimes(2);
    const [ratesDoc, ratesValue] = setSpy.mock.calls[0];
    expect(ratesDoc).toBe('compPlan');
    expect(ratesValue).toMatchObject({ rates: VALID.rates, updatedBy: 'o1', updatedByName: 'Owner' });
    const [marginDoc, marginValue] = setSpy.mock.calls[1];
    expect(marginDoc).toBe('compPlanMargin');
    expect(marginValue).toMatchObject({ margin: { att: { 'att-1gig': 520 } } });
  });

  it('audits a save with exactly the rates that moved, before and after', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    docs.set('compPlan', { rates: { ae_tier_1: { att: { 'att-1gig': 150, 'att-2gig': 200 } } } });
    docs.set('compPlanMargin', { margin: { att: { 'att-1gig': 500 } } });

    await PUT(put({
      rates: { ae_tier_1: { att: { 'att-1gig': 175, 'att-2gig': 200 } } },
      margin: { att: { 'att-1gig': 520 } },
    }));

    expect(writeAdminAudit).toHaveBeenCalledTimes(1);
    expect(writeAdminAudit).toHaveBeenCalledWith({
      action: 'compPlan.update',
      actorUid: 'o1',
      actorName: 'Owner',
      details: {
        rates: [{ path: 'ae_tier_1.att.att-1gig', from: 150, to: 175 }],
        margin: [{ path: 'att.att-1gig', from: 500, to: 520 }],
      },
    });
  });

  it('writes no audit row when the save is refused or invalid', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'a1', name: 'Admin', isAdmin: true, isOwner: false });
    await PUT(put(VALID));
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    await PUT(put({ rates: { ae_tier_1: { att: { 'att-1gig': -5 } } } }));

    expect(writeAdminAudit).not.toHaveBeenCalled();
  });

  it('diffs the first save against the committed plan, not against nothing', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    // No config docs yet: the committed plan is what was in effect.
    const rates = structuredClone(COMP_PLAN_RATES);
    rates.ae_tier_1!.att!['att-1gig'] = COMP_PLAN_RATES.ae_tier_1!.att!['att-1gig'] + 10;

    await PUT(put({ rates }));

    const details = vi.mocked(writeAdminAudit).mock.calls[0][0].details;
    expect(details?.rates).toEqual([
      { path: 'ae_tier_1.att.att-1gig', from: COMP_PLAN_RATES.ae_tier_1!.att!['att-1gig'], to: COMP_PLAN_RATES.ae_tier_1!.att!['att-1gig'] + 10 },
    ]);
  });
});

describe('PUT /api/portal/comp-plan — concurrent owner edits', () => {
  const SAVED_AT = new Date('2026-10-01T15:00:00.000Z');
  const OWNER = { ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true };

  beforeEach(() => {
    docs.set('compPlan', {
      rates: { ae_tier_1: { att: { 'att-1gig': 150 } } },
      updatedAt: { toDate: () => SAVED_AT },
    });
  });

  it('refuses a save made from a copy older than the stored plan', async () => {
    mockManagement.mockResolvedValue(OWNER);
    const res = await PUT(put({
      rates: { ae_tier_1: { att: { 'att-1gig': 175 } } },
      baseUpdatedAt: '2026-09-30T12:00:00.000Z',
    }));
    expect(res.status).toBe(409);
    expect(setSpy).not.toHaveBeenCalled();
    expect(writeAdminAudit).not.toHaveBeenCalled();
  });

  it('refuses a save from an editor that never loaded the stored plan', async () => {
    // A failed first load leaves updatedAt null and the rates empty.
    mockManagement.mockResolvedValue(OWNER);
    const res = await PUT(put({ rates: { ae_tier_1: { att: { 'att-1gig': 0 } } }, margin: {}, baseUpdatedAt: null }));
    expect(res.status).toBe(409);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('refuses a save with no baseUpdatedAt', async () => {
    mockManagement.mockResolvedValue(OWNER);
    const req = new NextRequest('http://localhost/api/portal/comp-plan', {
      method: 'PUT',
      body: JSON.stringify({ rates: { ae_tier_1: { att: { 'att-1gig': 175 } } } }),
    });
    expect((await PUT(req)).status).toBe(400);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('accepts a save made from the current copy', async () => {
    mockManagement.mockResolvedValue(OWNER);
    const res = await PUT(put({
      rates: { ae_tier_1: { att: { 'att-1gig': 175 } } },
      baseUpdatedAt: SAVED_AT.toISOString(),
    }));
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/portal/comp-plan — owner viewing as a rep', () => {
  it("gives the rep's own slice only: no full table, no margin, no pay roles", async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'o1', name: 'Owner', email: 'o@x.com',
      role: 'owner', isManagement: true, isAdmin: true, isManagerOrAbove: true, isOwner: true,
    });
    const res = await GET(new NextRequest('http://localhost/api/portal/comp-plan', { headers: viewAsHeaders() }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.scope).toBe('own');
    expect(json.fieldRole).toBe('entry_rep');
    expect(json.rates).toEqual(COMP_PLAN_RATES.ae_tier_1);
    expect('margin' in json).toBe(false);
    expect('repCompRoles' in json).toBe(false);
  });

  it('refuses an admin sending the header', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'a1', name: 'Admin', email: 'a@x.com',
      role: 'admin', isManagement: true, isAdmin: true, isManagerOrAbove: true, isOwner: false,
    });
    const res = await GET(new NextRequest('http://localhost/api/portal/comp-plan', { headers: viewAsHeaders() }));
    expect(res.status).toBe(403);
  });
});
