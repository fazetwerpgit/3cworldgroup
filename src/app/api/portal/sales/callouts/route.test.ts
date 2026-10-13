import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { gateMock, dayMock } = vi.hoisted(() => ({ gateMock: vi.fn(), dayMock: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { fake: true } }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));
vi.mock('@/lib/alerts/calloutNudges', () => ({ repCalloutDay: dayMock }));
vi.mock('@/lib/auth/viewAs', async () => (await import('@/lib/auth/viewAsTestStub')).viewAsStubModule());

import { GET } from './route';
import { viewAsHeaders } from '@/lib/auth/viewAsTestStub';

beforeEach(() => {
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
    expect(dayMock).toHaveBeenCalledWith({ fake: true }, 'rep-1');
  });

  it("owner viewing as a rep: the rep's counts", async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'owner-1', isOwner: true });
    const res = await GET(new NextRequest('http://localhost/api/portal/sales/callouts', { headers: viewAsHeaders() }));
    expect(await res.json()).toEqual({ day: '2026-10-13', callouts: 3, logged: 1, gap: 2 });
    expect(dayMock).toHaveBeenCalledWith({ fake: true }, 'rep-noah');
  });

  it('refuses a non-owner sending the header', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', isOwner: false });
    const res = await GET(new NextRequest('http://localhost/api/portal/sales/callouts', { headers: viewAsHeaders() }));
    expect(res.status).toBe(403);
    expect(dayMock).not.toHaveBeenCalled();
  });
});
