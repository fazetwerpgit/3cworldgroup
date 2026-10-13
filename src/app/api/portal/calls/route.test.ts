import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const calls = [
    { id: 'all-call', title: 'Monday Team Call', day: 'monday', time: '19:00', audience: 'all', active: true },
    { id: 'mgr-call', title: 'Managers Sync', day: 'tuesday', time: '18:00', audience: 'managers', active: true },
  ];
  const adminDb = {
    collection: (name: string) => {
      if (name === 'users') {
        return { doc: (id: string) => ({ get: async () => ({ exists: users.has(id), data: () => users.get(id) }) }) };
      }
      return { get: async () => ({ docs: calls.map((c) => ({ id: c.id, data: () => c })) }) };
    },
  };
  return { adminDb, users };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
  requireVerifiedUser: vi.fn(async () => ({ ok: true, uid: 'caller' })),
}));
vi.mock('@/lib/auth/viewAs', async () => (await import('@/lib/auth/viewAsTestStub')).viewAsStubModule());

import { DELETE, GET } from './route';
import { requireVerifiedManagement, requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { viewAsHeaders } from '@/lib/auth/viewAsTestStub';

async function titlesFor(profile: Record<string, unknown>): Promise<string[]> {
  db.users.set('caller', profile);
  const response = await GET(new NextRequest('http://localhost/api/portal/calls'));
  const body = await response.json();
  return body.calls.map((c: { title: string }) => c.title);
}

beforeEach(() => db.users.clear());

describe('DELETE /api/portal/calls', () => {
  it('400s a request with no JSON body instead of crashing', async () => {
    vi.mocked(requireVerifiedManagement).mockResolvedValue({ ok: true, uid: 'admin' } as never);
    const res = await DELETE(new NextRequest('http://localhost/api/portal/calls?id=x', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/portal/calls audience scoping', () => {
  it('shows an entry rep only the all-hands calls', async () => {
    expect(await titlesFor({ fieldRole: 'entry_rep', status: 'active' })).toEqual(['Monday Team Call']);
  });

  it.each(['l1_manager', 'ibo_level_2', 'general_manager', 'office_manager', 'regional_manager', 'director'])(
    'shows %s the managers call too',
    async (fieldRole) => {
      expect(await titlesFor({ fieldRole, status: 'active' })).toEqual(['Monday Team Call', 'Managers Sync']);
    }
  );

  it('shows platform users the managers call', async () => {
    expect(await titlesFor({ role: 'operations', status: 'active' })).toEqual(['Monday Team Call', 'Managers Sync']);
  });
});

describe('GET /api/portal/calls — owner viewing as a rep', () => {
  it("scopes the calls by the rep's role, not the owner's", async () => {
    db.users.set('owner-1', { role: 'owner', status: 'active' });
    db.users.set('rep-noah', { fieldRole: 'entry_rep', status: 'active' });
    vi.mocked(requireVerifiedUser).mockResolvedValueOnce({ ok: true, uid: 'owner-1', isOwner: true } as never);
    const res = await GET(new NextRequest('http://localhost/api/portal/calls', { headers: viewAsHeaders() }));
    const body = await res.json();
    expect(body.calls.map((c: { title: string }) => c.title)).toEqual(['Monday Team Call']);
  });

  it('refuses a non-owner sending the header', async () => {
    db.users.set('caller', { fieldRole: 'entry_rep', status: 'active' });
    const res = await GET(new NextRequest('http://localhost/api/portal/calls', { headers: viewAsHeaders() }));
    expect(res.status).toBe(403);
  });
});
