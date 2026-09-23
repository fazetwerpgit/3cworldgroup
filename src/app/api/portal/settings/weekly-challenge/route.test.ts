import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const docGet = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {},
  adminDb: { collection: () => ({ doc: () => ({ get: docGet }) }) },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: vi.fn(),
  requireVerifiedUser: vi.fn(async () => ({ ok: true, uid: 'u1', name: 'Rep', email: 'r@x.com' })),
}));

import { GET } from './route';

const req = () => new NextRequest('http://localhost/api/portal/settings/weekly-challenge');

beforeEach(() => {
  docGet.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/portal/settings/weekly-challenge', () => {
  it('returns the saved target', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ targetSales: 12 }) });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ targetSales: 12 });
  });

  it('falls back to the code default only when no target is set', async () => {
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ targetSales: 7 });
  });

  it('fails with 500 instead of a made-up target when the read fails', async () => {
    docGet.mockRejectedValue(new Error('unavailable'));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty('targetSales');
  });
});
