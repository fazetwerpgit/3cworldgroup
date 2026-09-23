import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(),
}));

const state: {
  exists: boolean;
  data: Record<string, unknown>;
  updates: Record<string, unknown>[];
} = { exists: true, data: {}, updates: [] };

const update = vi.fn(async (payload: Record<string, unknown>) => {
  state.updates.push(payload);
});

const carrier = vi.hoisted(() => ({ orders: [] as unknown[], fail: false }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() =>
        name === 'config'
          ? { get: vi.fn(async () => ({ exists: true, data: () => ({ lastReportAt: '2026-09-22T12:00:00.000Z' }) })) }
          : {
              get: vi.fn(async () => ({ exists: state.exists, data: () => state.data })),
              update,
            }
      ),
    })),
  },
  initError: null,
}));
vi.mock('@/lib/fiberReport/ordersCache', () => ({
  getAllFiberOrders: vi.fn(async () => {
    if (carrier.fail) throw new Error('read failed');
    return carrier.orders;
  }),
}));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: vi.fn() }));

import { PATCH } from './route';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';

const mockRequester = requireVerifiedRequester as unknown as ReturnType<typeof vi.fn>;
const params = Promise.resolve({ id: 's1' });

/** YYYY-MM-DD `days` from today, local time (the parser's own frame). */
function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function noon(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

function patch(body: unknown) {
  return new NextRequest('http://localhost/api/portal/sales/s1/install-date', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRequester.mockReset();
  mockRequester.mockResolvedValue({ ok: true, uid: 'rep1', name: 'Devon Price', isAdmin: false, isOwner: false });
  update.mockClear();
  state.exists = true;
  state.data = { salesRepId: 'rep1', status: 'approved', saleDate: noon(-10), installDate: noon(-3) };
  state.updates = [];
  carrier.orders = [];
  carrier.fail = false;
});

describe('PATCH /api/portal/sales/[id]/install-date', () => {
  it('lets a rep reschedule their own sale, stored at local noon and stamped as theirs', async () => {
    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    const written = state.updates[0];
    expect(written.installDate).toEqual(noon(5));
    expect(written.installDateSource).toBe('rep');
    expect(written.installDatePreviousDate).toEqual(noon(-3));
    expect(written.installDateChangedAt).toBeInstanceOf(Date);
    expect(written.installDateSetAt).toBeInstanceOf(Date);
    expect(written.repEditCarrierDate).toBeNull();
    expect(Object.keys(written).sort()).toEqual([
      'installDate',
      'installDateChangedAt',
      'installDatePreviousDate',
      'installDateSetAt',
      'installDateSource',
      'repEditCarrierDate',
      'updatedAt',
    ]);
  });

  it("records the carrier's date at edit time so the report sync can tell news from old news", async () => {
    state.data = { ...state.data, customerAddress: '77 Elm Ct, Tulsa, OK' };
    carrier.orders = [
      { id: 'brk_1', status: 'breakage', address: '77 Elm Ct', estInstallDate: dayFromToday(-3), saleLink: null },
    ];

    await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(state.updates[0].repEditCarrierDate).toBe(dayFromToday(-3));
  });

  it("still saves when the carrier's date can't be read", async () => {
    carrier.fail = true;

    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(200);
    expect(state.updates[0].repEditCarrierDate).toBeNull();
  });

  it('sets a first install date on an undated sale', async () => {
    state.data = { salesRepId: 'rep1', status: 'approved', saleDate: noon(-2) };

    const response = await PATCH(patch({ installDate: dayFromToday(3) }), { params });

    expect(response.status).toBe(200);
    expect(state.updates[0].installDatePreviousDate).toBeNull();
  });

  it('writes nothing when the day has not moved', async () => {
    const response = await PATCH(patch({ installDate: dayFromToday(-3) }), { params });

    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses another rep's sale", async () => {
    state.data = { ...state.data, salesRepId: 'rep2' };

    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses an admin on someone else's sale (they have the full edit)", async () => {
    mockRequester.mockResolvedValue({ ok: true, uid: 'a1', name: 'Admin', isAdmin: true, isOwner: false });
    state.data = { ...state.data, salesRepId: 'rep2' };

    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects any field besides the install date', async () => {
    const response = await PATCH(patch({ installDate: dayFromToday(5), products: [], salesRepId: 'rep1' }), { params });

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'rejected'])('leaves a %s sale alone', async (status) => {
    state.data = { ...state.data, status };

    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['not a date', 'soon'],
    ['an impossible day', '2026-02-31'],
    ['a missing value', undefined],
    ['more than a year out', dayFromToday(400)],
    ['a day before the sale', dayFromToday(-11)],
  ])('rejects %s with 400', async (_label, installDate) => {
    const response = await PATCH(patch(installDate === undefined ? {} : { installDate }), { params });

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('404s a sale that does not exist', async () => {
    state.exists = false;

    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(404);
  });

  it('passes an auth failure through', async () => {
    mockRequester.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const response = await PATCH(patch({ installDate: dayFromToday(5) }), { params });

    expect(response.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
});
