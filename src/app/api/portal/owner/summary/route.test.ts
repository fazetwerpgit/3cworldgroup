import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
}));
vi.mock('@/lib/owner/firestoreSource', () => ({
  createFirestoreOwnerSource: vi.fn(() => ({ fake: true })),
}));
vi.mock('@/lib/owner/companySummary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/owner/companySummary')>()),
  buildOwnerSummary: vi.fn(async (_source: unknown, sections: string[]) => ({
    generatedAt: '2026-09-22T17:00:00.000Z',
    sections,
  })),
}));

import { GET } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { buildOwnerSummary } from '@/lib/owner/companySummary';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const build = buildOwnerSummary as unknown as ReturnType<typeof vi.fn>;

const req = (query = '') => new NextRequest(`http://localhost/api/portal/owner/summary${query}`);

beforeEach(() => {
  gate.mockReset();
  build.mockClear();
});

describe('GET /api/portal/owner/summary', () => {
  it('rejects a caller without a verified token', async () => {
    gate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(build).not.toHaveBeenCalled();
  });

  it('refuses a rep (not management) with 403', async () => {
    gate.mockResolvedValue({ ok: false, error: 'Forbidden: management access required', status: 403 });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(build).not.toHaveBeenCalled();
  });

  it('refuses an admin — management but not owner — with 403', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'a1', name: 'Admin', isAdmin: true, isOwner: false });
    const res = await GET(req('?section=money'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: owner access required' });
    expect(build).not.toHaveBeenCalled();
  });

  it('refuses operations with 403', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'o1', name: 'Ops', isAdmin: false, isOwner: false });
    expect((await GET(req())).status).toBe(403);
  });

  it('serves the owner one section at a time', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w1', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await GET(req('?section=problems'));
    expect(res.status).toBe(200);
    expect(build.mock.calls[0][1]).toEqual(['problems']);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('serves all three sections when none is named', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w1', name: 'Owner', isAdmin: true, isOwner: true });
    await GET(req());
    expect(build.mock.calls[0][1]).toEqual(['money', 'problems', 'recruiting']);
  });

  it('rejects an unknown section', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w1', name: 'Owner', isAdmin: true, isOwner: true });
    expect((await GET(req('?section=payroll'))).status).toBe(400);
  });

  it('returns the sections that built and lists the failed ones', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w1', name: 'Owner', isAdmin: true, isOwner: true });
    build.mockResolvedValueOnce({ generatedAt: 'x', problems: [], recruiting: {}, failed: ['money'] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ failed: ['money'] });
  });

  it('is a 500 when every requested section failed', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w1', name: 'Owner', isAdmin: true, isOwner: true });
    build.mockResolvedValueOnce({ generatedAt: 'x', failed: ['money'] });
    const res = await GET(req('?section=money'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to build the owner summary' });
  });

  it('reports a failed build as a 500, never as zeros', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w1', name: 'Owner', isAdmin: true, isOwner: true });
    build.mockRejectedValueOnce(new Error('quota'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req('?section=money'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to build the owner summary' });
  });
});
