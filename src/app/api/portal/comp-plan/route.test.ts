import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-auth gates so we control who the caller is.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(),
  requireVerifiedManagement: vi.fn(),
}));

// config/compPlan and config/compPlanMargin are absent by default, so the route
// falls back to the committed module — the pre-seed state.
const docs = new Map<string, Record<string, unknown>>();
const setSpy = vi.fn();
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({ exists: docs.has(id), data: () => docs.get(id) })),
        set: vi.fn(async (value: unknown) => setSpy(id, value)),
      })),
    })),
  },
}));

import { GET, PUT } from './route';
import {
  requireVerifiedManagement,
  requireVerifiedRequester,
} from '@/lib/auth/requireVerifiedAdmin';
import { COMP_PLAN_RATES } from '@/data/compPlan.generated';

const mockRequester = requireVerifiedRequester as unknown as ReturnType<typeof vi.fn>;
const mockManagement = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;

function get() {
  return new NextRequest('http://localhost/api/portal/comp-plan');
}
function put(body: unknown) {
  return new NextRequest('http://localhost/api/portal/comp-plan', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRequester.mockReset();
  mockManagement.mockReset();
  setSpy.mockClear();
  docs.clear();
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

  it('gives operations no own slice', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'op1', name: 'Ops', email: 'op@x.com',
      role: 'operations', isManagement: true, isAdmin: false, isManagerOrAbove: true,
    });
    const json = await (await GET(get())).json();
    expect(json.compRole).toBeNull();
    expect(json.ownRates).toBeNull();
  });

  it('gives the owner the margin', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'o1', name: 'Owner', email: 'o@x.com',
      role: 'owner', isManagement: true, isAdmin: true, isManagerOrAbove: true,
    });
    const json = await (await GET(get())).json();
    expect(json.scope).toBe('all');
    expect(json.margin.att['att-1gig']).toBe(500);
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
});
