import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  gate: vi.fn(),
  requester: { role: 'owner' } as Record<string, unknown> | null,
  applications: [] as Array<Record<string, unknown>>,
  invites: [] as Array<Record<string, unknown>>,
  onboardingAccount: null as { uid: string } | null,
  anyAccount: null as { uid: string } | null,
  sendEmail: vi.fn(),
  created: null as Record<string, unknown> | null,
  applicationSet: null as { id: string; data: Record<string, unknown>; options: unknown } | null,
}));

// A Firestore stand-in for GET: users/{uid}, onboardingInvites and applications,
// each ordered newest first and honouring .limit().
vi.mock('@/lib/firebase/admin', () => {
  const docsOf = (rows: Array<Record<string, unknown>>) =>
    rows.map((row, index) => ({ id: String(row.id ?? `doc-${index}`), data: () => row }));
  const query = (rows: () => Array<Record<string, unknown>>) => ({
    orderBy: () => ({
      limit: (count: number) => ({
        get: async () => ({ docs: docsOf(rows().slice(0, count)) }),
      }),
    }),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: docsOf(rows().filter((row) => row[field] === value)) }),
    }),
  });
  return {
    adminDb: {
      collection: (name: string) => {
        if (name === 'users') {
          return {
            doc: () => ({
              get: async () => ({ exists: state.requester !== null, data: () => state.requester }),
            }),
          };
        }
        if (name === 'applications') {
          return {
            ...query(() => state.applications),
            doc: (id: string) => ({
              set: async (data: Record<string, unknown>, options: unknown) => {
                state.applicationSet = { id, data, options };
              },
            }),
          };
        }
        if (name === 'onboardingInvites') {
          return {
            ...query(() => state.invites),
            add: async (data: Record<string, unknown>) => {
              state.created = { ...data };
              const ref: Record<string, unknown> = {
                id: 'inv-new',
                update: async (patch: Record<string, unknown>) => {
                  state.created = { ...state.created, ...patch };
                },
              };
              // saveInviteEmailStatus writes the send result in a transaction.
              ref.firestore = {
                runTransaction: async <T,>(run: (transaction: unknown) => Promise<T>) =>
                  run({
                    get: async () => ({ exists: state.created !== null, data: () => state.created }),
                    update: (_ref: unknown, patch: Record<string, unknown>) => {
                      state.created = { ...state.created, ...patch };
                    },
                  }),
              };
              return ref;
            },
          };
        }
        return query(() => []);
      },
    },
  };
});
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: state.sendEmail, onboardingFrom: () => 'onboarding@test' }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: state.gate }));
vi.mock('@/lib/auth/existingAccount', () => ({
  findActivePortalAccount: vi.fn(async () => null),
  findOnboardingPortalAccount: vi.fn(async () => state.onboardingAccount),
  findAnyAccount: vi.fn(async () => state.anyAccount),
}));

import { GET, POST } from './route';

const at = (minutesAgo: number) => ({ toDate: () => new Date(Date.UTC(2026, 8, 1) - minutesAgo * 60_000) });

function application(index: number, extra: Record<string, unknown> = {}) {
  return {
    id: `app-${index}`,
    name: `Applicant ${index}`,
    phone: '555-0100',
    email: `a${index}@example.com`,
    city: 'Austin',
    status: 'applied',
    createdAt: at(index),
    ...extra,
  };
}

function getRequest() {
  return new NextRequest('http://localhost/api/portal/recruiting/invites', {
    headers: { authorization: 'Bearer token' },
  });
}

beforeEach(() => {
  state.gate.mockResolvedValue({ ok: true, uid: 'owner-1', name: 'Owner', email: 'o@example.com' });
  state.requester = { role: 'owner' };
  state.applications = [];
  state.invites = [];
  state.onboardingAccount = null;
  state.anyAccount = null;
  state.sendEmail.mockReset().mockResolvedValue({ ok: true, messageId: 'pm-1' });
  state.created = null;
  state.applicationSet = null;
});

it('returns every application, not just the newest 50', async () => {
  state.applications = Array.from({ length: 55 }, (_, index) => application(index));

  const response = await GET(getRequest());
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.applications).toHaveLength(55);
  expect(json.applications[54].id).toBe('app-54');
});

it('includes who referred an applicant', async () => {
  state.applications = [
    application(1, { referredBy: 'Jordan Reyes' }),
    application(2),
  ];

  const json = await (await GET(getRequest())).json();
  expect(json.applications.map((row: { referredBy: string }) => row.referredBy)).toEqual(['Jordan Reyes', '']);
});

it('refuses applications to someone who cannot manage recruiting', async () => {
  state.requester = { role: 'rep', fieldRole: 'entry_level_rep' };
  state.applications = [application(1)];

  const response = await GET(getRequest());
  expect(response.status).toBe(403);
});

it('rejects a direct invite POST for a non-invitable field role', async () => {
  const request = new NextRequest('http://localhost/api/portal/recruiting/invites', {
    method: 'POST',
    body: JSON.stringify({
      candidateName: 'Candidate',
      candidateEmail: 'candidate@example.com',
      candidatePhone: '555-0100',
      intendedFieldRole: 'general_manager',
    }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await POST(request);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: 'Invalid field role' });
});

function invite(index: number, extra: Record<string, unknown> = {}) {
  return { id: `inv-${index}`, status: 'invited', ownerId: 'other', createdAt: at(index), ...extra };
}

it("lists a manager's own invites even when 100+ newer invites belong to others", async () => {
  state.requester = { role: 'rep', fieldRole: 'l1_manager' };
  state.gate.mockResolvedValue({ ok: true, uid: 'mgr-1', name: 'Mgr', email: 'm@example.com' });
  state.invites = [
    ...Array.from({ length: 120 }, (_, index) => invite(index)),
    invite(500, { ownerId: 'mgr-1', status: 'submitted' }),
  ];

  const json = await (await GET(getRequest())).json();
  expect(json.invites.map((row: { id: string }) => row.id)).toEqual(['inv-500']);
});

it('gives management an old submitted invite beyond the newest 100', async () => {
  state.invites = [
    ...Array.from({ length: 120 }, (_, index) => invite(index)),
    invite(500, { status: 'submitted' }),
  ];

  const json = await (await GET(getRequest())).json();
  expect(json.invites).toHaveLength(101);
  expect(json.invites.at(-1).id).toBe('inv-500');
});

it('refuses a new invite for an email already partway through onboarding', async () => {
  state.onboardingAccount = { uid: 'pending-1' };
  const request = new NextRequest('http://localhost/api/portal/recruiting/invites', {
    method: 'POST',
    body: JSON.stringify({
      candidateName: 'Rex',
      candidateEmail: 'rex@example.com',
      candidatePhone: '555-0100',
      intendedFieldRole: 'entry_level_rep',
    }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await POST(request);
  expect(response.status).toBe(409);
});

function inviteRequest(intendedFieldRole = 'entry_level_rep') {
  return new NextRequest('http://localhost/api/portal/recruiting/invites', {
    method: 'POST',
    body: JSON.stringify({
      candidateName: 'Rex',
      candidateEmail: 'rex@example.com',
      candidatePhone: '555-0100',
      intendedFieldRole,
    }),
    headers: { 'content-type': 'application/json' },
  });
}

const sentinel = (value: unknown) => (value as { methodName?: string } | null)?.methodName;

it('saves on the new invite that the email went out, with Postmark\'s message id', async () => {
  const json = await (await POST(inviteRequest())).json();
  expect(json).toMatchObject({ emailSent: true, invite: { id: 'inv-new', emailStatus: 'sent' } });
  expect(state.created).toMatchObject({ status: 'invited', emailStatus: 'sent', postmarkMessageId: 'pm-1' });
  expect(sentinel(state.created?.emailedAt)).toBe('FieldValue.serverTimestamp');
  expect(state.sendEmail).toHaveBeenCalledWith(
    expect.objectContaining({ to: 'rex@example.com', tag: 'onboarding-invite', metadata: { inviteId: 'inv-new' } })
  );
});

it('saves on the new invite that the email did not go out, with a short reason', async () => {
  state.sendEmail.mockResolvedValue({ ok: false, error: 'postmark_422' });
  const json = await (await POST(inviteRequest())).json();
  expect(json).toMatchObject({ success: true, emailSent: false, invite: { emailStatus: 'failed' } });
  expect(state.created).toMatchObject({ emailStatus: 'failed', emailError: 'postmark_422' });
  expect(sentinel(state.created?.emailedAt)).toBe('FieldValue.delete');
  expect(sentinel(state.created?.postmarkMessageId)).toBe('FieldValue.delete');
});

it('lists each invite with its email status, null on older invites', async () => {
  state.invites = [invite(1, { emailStatus: 'bounced' }), invite(2)];
  const json = await (await GET(getRequest())).json();
  expect(json.invites.map((row: { emailStatus: unknown }) => row.emailStatus)).toEqual(['bounced', null]);
});

const asFieldManager = (fieldRole = 'l1_manager') => {
  state.requester = { role: 'rep', fieldRole, displayName: 'Mgr' };
  state.gate.mockResolvedValue({ ok: true, uid: 'mgr-1', name: 'Mgr', email: 'm@example.com' });
};

describe('an email that already has an account', () => {
  it.each(['l1_manager', 'l2_manager', 'ibo_level_1'])('is refused to a %s, with no invite made', async (fieldRole) => {
    asFieldManager(fieldRole);
    state.anyAccount = { uid: 'former-rep' };

    const response = await POST(inviteRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'That email already has an account. Ask an admin to re-invite them.',
    });
    expect(state.created).toBeNull();
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('is refused to a recruiter-flag holder (not admin), with the clear message', async () => {
    state.requester = { fieldRole: 'general_manager', displayName: 'Rec', recruiter: true };
    state.gate.mockResolvedValue({ ok: true, uid: 'rec-1', name: 'Rec', email: 'r@example.com' });
    state.anyAccount = { uid: 'former-rep' };

    const response = await POST(inviteRequest('regional_manager'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'That email already has an account. Ask an admin to re-invite them.',
    });
    expect(state.created).toBeNull();
  });

  it('is refused to operations (below admin)', async () => {
    state.requester = { role: 'operations' };
    state.anyAccount = { uid: 'former-rep' };
    expect((await POST(inviteRequest())).status).toBe(409);
  });

  it.each(['admin', 'owner'])('may be re-invited by an %s, emailed only: no link comes back', async (role) => {
    state.requester = { role };
    state.anyAccount = { uid: 'former-rep' };

    const response = await POST(inviteRequest());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).not.toHaveProperty('inviteUrl');
    expect(json.invite).toMatchObject({ existingAccount: true });
    expect(state.created).toMatchObject({ accountExistedAtInvite: true });
    expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'rex@example.com' }));
  });
});

it("gives a field manager the copy link for a brand-new account's invite", async () => {
  asFieldManager();
  const json = await (await POST(inviteRequest())).json();
  expect(json.inviteUrl).toMatch(/^https:\/\/www\.3cworldgroup\.com\/onboard\//);
  expect(state.created).toMatchObject({ accountExistedAtInvite: false, ownerId: 'mgr-1' });
});

describe('role ceiling', () => {
  it.each(['regional_manager', 'director'])('refuses a field manager inviting a %s', async (role) => {
    asFieldManager();
    const response = await POST(inviteRequest(role));
    expect(response.status).toBe(403);
    expect(state.created).toBeNull();
  });

  it.each(['ibo_level_4', 'l2_manager'])('refuses a %s inviting a director', async (fieldRole) => {
    asFieldManager(fieldRole);
    expect((await POST(inviteRequest('director'))).status).toBe(403);
  });

  it.each(['entry_level_rep', 'ae_tier_1', 'ae_tier_2'])('lets a field manager invite a %s', async (role) => {
    asFieldManager();
    expect((await POST(inviteRequest(role))).status).toBe(200);
  });

  it('lets management invite a director', async () => {
    expect((await POST(inviteRequest('director'))).status).toBe(200);
  });
});

it('marks the linked application invited and clears any Not a fit stamp', async () => {
  const request = new NextRequest('http://localhost/api/portal/recruiting/invites', {
    method: 'POST',
    body: JSON.stringify({
      candidateName: 'Rex',
      candidateEmail: 'rex@example.com',
      candidatePhone: '555-0100',
      intendedFieldRole: 'entry_level_rep',
      applicationId: 'app-7',
    }),
    headers: { 'content-type': 'application/json' },
  });
  expect((await POST(request)).status).toBe(200);
  expect(state.applicationSet).toMatchObject({
    id: 'app-7',
    data: { status: 'invited', inviteId: 'inv-new' },
    options: { merge: true },
  });
  const data = state.applicationSet?.data ?? {};
  for (const field of ['notSelectedAt', 'notSelectedBy', 'notSelectedByName', 'statusBeforeNotSelected']) {
    expect(sentinel(data[field])).toBe('FieldValue.delete');
  }
});

it('invites the same email again after its earlier invite was cancelled', async () => {
  state.invites = [
    invite(1, { candidateEmail: 'rex@example.com', status: 'cancelled', applicationId: 'app-7' }),
  ];
  const response = await POST(inviteRequest());
  expect(response.status).toBe(200);
  expect(state.created).toMatchObject({ candidateEmail: 'rex@example.com', status: 'invited' });
});

it('lists a cancelled invite with when and by whom', async () => {
  state.invites = [
    invite(1, { status: 'cancelled', cancelledAt: at(0), cancelledByName: 'Mia Manager' }),
    invite(2),
  ];
  const json = await (await GET(getRequest())).json();
  expect(json.invites[0]).toMatchObject({
    status: 'cancelled',
    cancelledAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
    cancelledByName: 'Mia Manager',
  });
  expect(json.invites[1]).toMatchObject({ cancelledAt: null, cancelledByName: null });
});
