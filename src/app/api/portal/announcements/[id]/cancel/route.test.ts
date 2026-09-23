import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { docs, updates } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { id: string }) => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) }),
        update: (ref: { id: string }, patch: Record<string, unknown>) => updates.push({ id: ref.id, patch }),
      }),
  },
}));

import { POST } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };

const cancel = (id: string) =>
  POST(new NextRequest(`http://localhost/api/portal/announcements/${id}/cancel`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  gate.mockReset();
  docs.clear();
  updates.length = 0;
  docs.set('sched', { status: 'scheduled' });
  docs.set('sending', { status: 'sending' });
  docs.set('sent', { status: 'sent' });
});

describe('POST /api/portal/announcements/[id]/cancel', () => {
  it.each([
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', { ok: true, uid: 'a', name: 'A', isAdmin: true, isOwner: false }, 403],
  ])('refuses %s', async (_who, result, status) => {
    gate.mockResolvedValue(result);
    expect((await cancel('sched')).status).toBe(status);
    expect(updates).toEqual([]);
  });

  it('cancels a scheduled announcement', async () => {
    gate.mockResolvedValue(OWNER);
    expect((await cancel('sched')).status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: 'sched', patch: { status: 'cancelled', cancelledBy: 'owner-1' } });
  });

  it.each(['sending', 'sent'])('refuses once the send has started (%s)', async (id) => {
    gate.mockResolvedValue(OWNER);
    expect((await cancel(id)).status).toBe(409);
    expect(updates).toEqual([]);
  });

  it('404s an unknown announcement', async () => {
    gate.mockResolvedValue(OWNER);
    expect((await cancel('nope')).status).toBe(404);
  });
});
