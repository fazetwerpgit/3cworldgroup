import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { gateMock, dayMock, users } = vi.hoisted(() => ({
  gateMock: vi.fn(),
  dayMock: vi.fn(),
  users: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    fake: true,
    collection: () => ({ doc: (uid: string) => ({ get: async () => ({ data: () => users.get(uid) }) }) }),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));
vi.mock('@/lib/alerts/calloutNudges', () => ({ repCalloutDay: dayMock }));
vi.mock('@/lib/auth/viewAs', async () => (await import('@/lib/auth/viewAsTestStub')).viewAsStubModule());

import { GET } from './route';
import { viewAsHeaders } from '@/lib/auth/viewAsTestStub';

beforeEach(() => {
  users.clear();
  gateMock.mockReset();
  dayMock.mockReset();
  dayMock.mockImplementation(async (_db: unknown, uid: string) => ({
    day: '2026-10-13',
    callouts: uid === 'rep-noah' ? 3 : 0,
    logged: 1,
    gap: uid === 'rep-noah' ? 2 : 0,
  }));
});

describe('GET /api/portal/sales/callouts', () => {
  it("counts the caller's own callouts", async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'rep-1', isOwner: false });
    const res = await GET(new NextRequest('http://localhost/api/portal/sales/callouts'));
    expect(res.status).toBe(200);
    expect(dayMock).toHaveBeenCalledWith(expect.objectContaining({ fake: true }), 'rep-1');
  });

  it("owner viewing as a rep: the rep's counts", async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'owner-1', isOwner: true });
    const res = await GET(new NextRequest('http://localhost/api/portal/sales/callouts', { headers: viewAsHeaders() }));
    expect(await res.json()).toEqual({ day: '2026-10-13', callouts: 3, logged: 1, gap: 2 });
    expect(dayMock).toHaveBeenCalledWith(expect.objectContaining({ fake: true }), 'rep-noah');
  });

  it('refuses a non-owner sending the header', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', isOwner: false });
    const res = await GET(new NextRequest('http://localhost/api/portal/sales/callouts', { headers: viewAsHeaders() }));
    expect(res.status).toBe(403);
    expect(dayMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/sales/callouts — demo account', () => {
  it('reports no gap for a demo subject', async () => {
    users.set('demo', { demoAccount: true });
    dayMock.mockResolvedValue({ day: '2026-10-13', callouts: 0, logged: 2, gap: 2 });
    gateMock.mockResolvedValue({ ok: true, uid: 'demo', isOwner: false });
    const res = await GET(new NextRequest('http://localhost/api/portal/sales/callouts'));
    expect(await res.json()).toEqual({ day: '2026-10-13', callouts: 0, logged: 2, gap: 0 });
  });
});
