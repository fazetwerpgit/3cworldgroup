import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => ({
  doc: { exists: true, data: {} as Record<string, unknown> },
  update: vi.fn(async (_data: Record<string, unknown>) => undefined),
  remove: vi.fn(async () => undefined),
  deleteFiles: vi.fn(async (_opts: { prefix: string }) => undefined),
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'ops-1', name: 'Ops' })),
  requireVerifiedRequester: vi.fn(async () => ({ ok: true, uid: 'ops-1', name: 'Ops' })),
  requireVerifiedUser: vi.fn(async () => ({ ok: true, uid: 'ops-1', name: 'Ops' })),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: fake.doc.exists, data: () => fake.doc.data }),
        update: fake.update,
        delete: fake.remove,
      }),
    }),
  },
  getOnboardingBucket: () => ({ deleteFiles: fake.deleteFiles }),
}));

import { DELETE, PUT } from './route';

const params = { params: Promise.resolve({ id: 'res-1' }) };
const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/portal/training/res-1', { method: 'PUT', body: JSON.stringify(body) }), params);
const del = () => DELETE(new NextRequest('http://localhost/api/portal/training/res-1', { method: 'DELETE' }), params);

beforeEach(() => {
  vi.clearAllMocks();
  fake.doc = { exists: true, data: {} };
});

describe('training resource PUT/DELETE (S-12)', () => {
  it('refuses a storagePath that is not one file in one upload folder', async () => {
    const res = await put({ storagePath: 'training/x' });
    expect(res.status).toBe(400);
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('writes only the resource fields, never arbitrary keys', async () => {
    const res = await put({ title: 'New', isPublished: false, createdAt: 'x', requestedBy: 'u', status: 'hacked', role: 'owner' });
    expect(res.status).toBe(200);
    const written = fake.update.mock.calls[0][0];
    expect(written).toMatchObject({ title: 'New', isPublished: false });
    expect(written).not.toHaveProperty('createdAt');
    expect(written).not.toHaveProperty('status');
    expect(written).not.toHaveProperty('role');
    expect(written).not.toHaveProperty('requestedBy');
  });

  it('deletes only the upload folder of a valid storagePath', async () => {
    fake.doc.data = { storagePath: 'training/abc123/deck.pdf' };
    expect((await del()).status).toBe(200);
    expect(fake.deleteFiles).toHaveBeenCalledWith({ prefix: 'training/abc123/', force: true });
  });

  it('never deletes training/ as a whole for a malformed stored path', async () => {
    fake.doc.data = { storagePath: 'training/x' };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await del()).status).toBe(200);
    } finally {
      errorSpy.mockRestore();
    }
    expect(fake.remove).toHaveBeenCalled();
    expect(fake.deleteFiles).not.toHaveBeenCalled();
  });
});
