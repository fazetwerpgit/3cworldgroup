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

import { GET } from './route';

async function titlesFor(profile: Record<string, unknown>): Promise<string[]> {
  db.users.set('caller', profile);
  const response = await GET(new NextRequest('http://localhost/api/portal/calls'));
  const body = await response.json();
  return body.calls.map((c: { title: string }) => c.title);
}

beforeEach(() => db.users.clear());

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
