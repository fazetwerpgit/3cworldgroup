import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ users: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/firebase/admin', () => {
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((row) => ({ id: String(row.id), data: () => row })),
  });
  return {
    adminDb: {
      collection: (name: string) => ({
        get: async () => snap(name === 'users' ? state.users : []),
        where: () => ({ get: async () => snap([]) }),
      }),
    },
  };
});
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'admin-1' })),
}));

import { GET } from './route';

beforeEach(() => {
  state.users = [];
});

it('does not keep an active rep with no checklist records in Processing', async () => {
  state.users = [
    { id: 'active-rep', fieldRole: 'ae_tier_1', status: 'active' },
    { id: 'pending-hire', fieldRole: 'entry_level_rep', status: 'pending' },
  ];

  const json = await (await GET(new NextRequest('http://localhost/api/portal/pipeline'))).json();
  const stageOf = (uid: string) => json.reps.find((rep: { uid: string }) => rep.uid === uid)?.stage;

  expect(stageOf('active-rep')).toBe('need_logins');
  expect(stageOf('pending-hire')).toBe('processing');
});
