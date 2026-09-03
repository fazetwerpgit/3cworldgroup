import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: vi.fn(),
}));

const state: {
  exists: boolean;
  data: Record<string, unknown>;
  updates: Record<string, unknown>[];
} = { exists: true, data: {}, updates: [] };

const update = vi.fn(async (payload: Record<string, unknown>) => {
  state.updates.push(payload);
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ exists: state.exists, data: () => state.data })),
        update,
      })),
    })),
  },
  initError: null,
}));

import { POST, DELETE } from './route';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';

const mockAdmin = requireVerifiedAdmin as unknown as ReturnType<typeof vi.fn>;
const params = Promise.resolve({ id: 's1' });

function post(body?: unknown) {
  return new NextRequest('http://localhost/api/portal/sales/s1/cancel', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function del() {
  return new NextRequest('http://localhost/api/portal/sales/s1/cancel', { method: 'DELETE' });
}

beforeEach(() => {
  mockAdmin.mockReset();
  mockAdmin.mockResolvedValue({ ok: true, uid: 'a1', name: 'Jacob Myers' });
  update.mockClear();
  state.exists = true;
  state.data = { status: 'approved' };
  state.updates = [];
});

describe('POST /api/portal/sales/[id]/cancel', () => {
  it('stamps who cancelled it and why, and keeps the row', async () => {
    const response = await POST(post({ reason: 'Customer moved' }), { params });

    expect(response.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'a1',
      cancellerName: 'Jacob Myers',
      cancelReason: 'Customer moved',
    });
  });

  it('accepts a cancellation with no reason given', async () => {
    const response = await POST(post(), { params });

    expect(response.status).toBe(200);
    expect(state.updates[0].cancelReason).toBe('');
  });

  it('caps a runaway reason rather than storing it whole', async () => {
    await POST(post({ reason: 'x'.repeat(500) }), { params });

    expect((state.updates[0].cancelReason as string).length).toBe(300);
  });

  it('refuses a non-admin', async () => {
    mockAdmin.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });

    const response = await POST(post({ reason: 'nope' }), { params });

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('404s a sale that is not there', async () => {
    state.exists = false;

    expect((await POST(post(), { params })).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('will not re-cancel an already cancelled sale', async () => {
    state.data = { status: 'cancelled' };

    expect((await POST(post(), { params })).status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/portal/sales/[id]/cancel', () => {
  it('restores a cancelled sale and clears the cancellation stamps', async () => {
    state.data = { status: 'cancelled', cancelledBy: 'a1', cancelReason: 'Customer moved' };

    const response = await DELETE(del(), { params });

    expect(response.status).toBe(200);
    expect(state.updates[0]).toMatchObject({
      status: 'approved',
      cancelledAt: null,
      cancelledBy: null,
      cancellerName: null,
      cancelReason: '',
    });
  });

  it('refuses to restore a sale that was never cancelled', async () => {
    expect((await DELETE(del(), { params })).status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a non-admin', async () => {
    state.data = { status: 'cancelled' };
    mockAdmin.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });

    expect((await DELETE(del(), { params })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});
