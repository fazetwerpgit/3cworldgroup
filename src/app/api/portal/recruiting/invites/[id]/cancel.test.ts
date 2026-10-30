import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// PATCH { action: 'cancel' } on one invite: who may, which invites, and what
// it leaves behind (the invite closed, its application back in To do).

type Doc = Record<string, unknown> | null;

const state = vi.hoisted(() => ({
  gate: vi.fn(),
  users: {} as Record<string, Record<string, unknown>>,
  invite: null as Record<string, unknown> | null,
  application: null as Record<string, unknown> | null,
  /** Runs inside the transaction before its reads: a change that lands meanwhile. */
  race: null as null | (() => void),
}));

vi.mock('@/lib/firebase/admin', () => {
  const ref = (collection: string, id: string) => ({ collection, id });
  type Ref = ReturnType<typeof ref>;
  const read = (r: Ref): Doc =>
    r.collection === 'users'
      ? (state.users[r.id] ?? null)
      : r.collection === 'onboardingInvites'
        ? state.invite
        : state.application;
  const snap = (r: Ref) => {
    const data = read(r);
    return { exists: data !== null, data: () => data ?? undefined, get: (key: string) => data?.[key] };
  };
  const write = (r: Ref, patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...(read(r) ?? {}), ...patch };
    for (const [key, value] of Object.entries(patch)) {
      if ((value as { methodName?: string } | null)?.methodName === 'FieldValue.delete') delete next[key];
    }
    if (r.collection === 'onboardingInvites') state.invite = next;
    else if (r.collection === 'applications') state.application = next;
  };
  return {
    adminDb: {
      collection: (name: string) => ({
        doc: (id: string) => {
          const r = ref(name, id);
          return { ...r, get: async () => snap(r) };
        },
      }),
      runTransaction: async <T,>(run: (tx: unknown) => Promise<T>) => {
        state.race?.();
        return run({
          get: async (r: Ref) => snap(r),
          update: (r: Ref, patch: Record<string, unknown>) => write(r, patch),
        });
      },
    },
  };
});
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: state.gate }));

import { PATCH } from './route';

const params = { params: Promise.resolve({ id: 'inv-1' }) };
const cancel = (body: unknown = { action: 'cancel' }) =>
  PATCH(
    new NextRequest('https://portal.test/api/portal/recruiting/invites/inv-1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }),
    params
  );
const inDays = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  return { toDate: () => date };
};
const as = (uid: string, user: Record<string, unknown>) => {
  state.gate.mockResolvedValue({ ok: true, uid });
  state.users[uid] = user;
};

beforeEach(() => {
  state.race = null;
  state.users = {};
  as('mgr-1', { role: 'field_rep', fieldRole: 'l1_manager', displayName: 'Mia Manager' });
  state.invite = {
    candidateName: 'Hal Hire',
    candidateEmail: 'hire@example.com',
    status: 'invited',
    ownerId: 'mgr-1',
    applicationId: 'app-1',
    expiresAt: inDays(5),
  };
  state.application = { name: 'Hal Hire', status: 'invited', inviteId: 'inv-1' };
});

it('lets the manager who sent it cancel, closing the invite and putting the application back in To do', async () => {
  const response = await cancel();
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json).toMatchObject({ status: 'cancelled', cancelledByName: 'Mia Manager', applicationReopened: true });
  expect(state.invite).toMatchObject({ status: 'cancelled', cancelledBy: 'mgr-1', cancelledByName: 'Mia Manager' });
  expect(state.invite?.cancelledAt).toBeInstanceOf(Date);
  expect(state.application?.status).toBe('applied');
  expect(state.application).not.toHaveProperty('inviteId');
});

it("keeps a field manager off another manager's invite", async () => {
  state.invite = { ...state.invite, ownerId: 'someone-else' };
  expect((await cancel()).status).toBe(403);
  expect(state.invite?.status).toBe('invited');
});

it('lets management and the recruiter grant cancel any invite', async () => {
  state.invite = { ...state.invite, ownerId: 'someone-else' };
  as('ops-1', { role: 'operations', displayName: 'Olive Ops' });
  expect((await cancel()).status).toBe(200);
  expect(state.invite?.cancelledByName).toBe('Olive Ops');

  state.invite = { ...state.invite, status: 'in_progress' };
  as('rec-1', { role: 'field_rep', fieldRole: 'entry_level_rep', recruiter: true, displayName: 'Rae Recruiter' });
  expect((await cancel()).status).toBe(200);
  expect(state.invite?.cancelledByName).toBe('Rae Recruiter');
});

it('refuses a rep who cannot manage recruiting, and anyone not signed in', async () => {
  as('rep-1', { role: 'field_rep', fieldRole: 'entry_level_rep' });
  expect((await cancel()).status).toBe(403);
  state.gate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
  expect((await cancel()).status).toBe(401);
  expect(state.invite?.status).toBe('invited');
});

it('cancels opened and run-out invites', async () => {
  for (const status of ['in_progress', 'expired']) {
    state.invite = { ...state.invite, status };
    state.application = { status: 'invited', inviteId: 'inv-1' };
    expect((await cancel()).status).toBe(200);
    expect(state.invite?.status).toBe('cancelled');
  }
});

it('refuses (409) an invite whose paperwork came back, or one already closed', async () => {
  for (const status of ['submitted', 'approved', 'converted', 'rejected', 'cancelled']) {
    state.invite = { ...state.invite, status };
    const response = await cancel();
    expect(response.status).toBe(409);
    expect(state.invite?.status).toBe(status);
  }
  expect(state.application?.status).toBe('invited');
});

it('refuses (409) when the packet comes back while the cancel is on its way', async () => {
  state.race = () => {
    state.invite = { ...state.invite, status: 'submitted' };
  };
  const response = await cancel();
  expect(response.status).toBe(409);
  expect(state.invite?.status).toBe('submitted');
  expect(state.application?.status).toBe('invited');
});

it('leaves an application that has moved on to another invite alone', async () => {
  state.application = { status: 'invited', inviteId: 'inv-2' };
  const json = await (await cancel()).json();
  expect(json.applicationReopened).toBe(false);
  expect(state.application).toEqual({ status: 'invited', inviteId: 'inv-2' });
});

it('cancels an invite typed in by hand (no application)', async () => {
  state.invite = { ...state.invite, applicationId: undefined };
  const json = await (await cancel()).json();
  expect(json.applicationReopened).toBe(false);
  expect(state.invite?.status).toBe('cancelled');
});

it('answers 404 for a missing invite and 400 for an unknown action', async () => {
  expect((await cancel({ action: 'delete' })).status).toBe(400);
  state.invite = null;
  expect((await cancel()).status).toBe(404);
});
