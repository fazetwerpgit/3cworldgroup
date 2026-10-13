import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { fake: true } }));
vi.mock('@/lib/search/ownerSearchStats', () => ({
  loadOwnerSearchStats: vi.fn(async () => ({ search: null, applications: { last7: {}, last30: {} } })),
}));

import { GET } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { loadOwnerSearchStats } from '@/lib/search/ownerSearchStats';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const load = loadOwnerSearchStats as unknown as ReturnType<typeof vi.fn>;
const req = () => new NextRequest('http://localhost/api/portal/owner/search-stats');

beforeEach(() => {
  gate.mockReset();
  load.mockClear();
});

describe('GET /api/portal/owner/search-stats', () => {
  it('passes a failed gate through', async () => {
    gate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await GET(req())).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
  });

  it('refuses an admin who is not the owner', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'a1', name: 'Admin', isAdmin: true, isOwner: false });
    expect((await GET(req())).status).toBe(403);
    expect(load).not.toHaveBeenCalled();
  });

  it('answers the owner, uncached', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'o1', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ search: null, applications: { last7: {}, last30: {} } });
  });
});
