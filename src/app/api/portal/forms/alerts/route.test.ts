import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const writes = vi.hoisted(() => [] as Array<{ id: string; data: unknown }>);
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (id: string) => ({
        set: async (data: unknown) => {
          writes.push({ id, data });
        },
      }),
    }),
  },
}));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'ops1' })),
  requireVerifiedAdmin: vi.fn(async () => ({ ok: true, uid: 'admin1' })),
}));

import { PUT } from './route';

const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/portal/forms/alerts', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  );

describe('PUT /api/portal/forms/alerts', () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'rejects inherited prototype name %s with 400 and writes nothing',
    async (key) => {
      const res = await put({ key, enabled: false });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown form key' });
      expect(writes).toHaveLength(0);
    }
  );

  it('saves a real form key', async () => {
    const res = await put({ key: 'fiber-report', enabled: false });
    expect(res.status).toBe(200);
    expect(writes).toEqual([
      { id: 'fiber-report', data: expect.objectContaining({ enabled: false, updatedBy: 'admin1' }) },
    ]);
  });
});
