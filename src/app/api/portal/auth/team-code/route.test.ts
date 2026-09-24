import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashInviteToken } from '@/lib/recruiting/tokens';

const { invites, inviteSet, queryGet } = vi.hoisted(() => ({
  invites: new Map<string, Record<string, unknown>>(),
  inviteSet: vi.fn(),
  queryGet: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json(data: unknown, init?: { status?: number }) {
      return new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      where: (_field: string, _op: string, tokenHash: string) => ({
        limit: () => ({
          get: async () => {
            queryGet();
            const data = name === 'onboardingInvites' ? invites.get(tokenHash) : undefined;
            return {
              empty: !data,
              docs: data ? [{ id: 'invite-1', ref: { set: inviteSet }, data: () => data }] : [],
            };
          },
        }),
      }),
    }),
  },
}));

import { POST } from './route';

const TEAM_CODE = 'Lime-Horizon-42';
const OPEN_TOKEN = 'openTokenAbcdefghijklmnopqrstuvwxyz0123456';
const SUBMITTED_TOKEN = 'sentTokenAbcdefghijklmnopqrstuvwxyz0123456';
const EXPIRED_TOKEN = 'lateTokenAbcdefghijklmnopqrstuvwxyz0123456';
const MARKED_EXPIRED_TOKEN = 'markTokenAbcdefghijklmnopqrstuvwxyz0123456';
const REJECTED_TOKEN = 'nopeTokenAbcdefghijklmnopqrstuvwxyz0123456';
const UNKNOWN_TOKEN = 'noneTokenAbcdefghijklmnopqrstuvwxyz0123456';

const at = (offsetMs: number) => ({ toDate: () => new Date(Date.now() + offsetMs) });
const DAY = 24 * 60 * 60 * 1000;

function seed(token: string, data: Record<string, unknown>) {
  invites.set(hashInviteToken(token), { candidateEmail: 'hire@example.com', ...data });
}

async function post(body: unknown) {
  const response = await POST(
    new Request('http://localhost/api/portal/auth/team-code', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> };
}

beforeEach(() => {
  vi.stubEnv('PORTAL_TEAM_CODE', TEAM_CODE);
  invites.clear();
  seed(OPEN_TOKEN, { status: 'in_progress', expiresAt: at(DAY) });
  seed(SUBMITTED_TOKEN, { status: 'submitted', expiresAt: at(DAY) });
  seed(EXPIRED_TOKEN, { status: 'in_progress', expiresAt: at(-DAY) });
  seed(MARKED_EXPIRED_TOKEN, { status: 'expired', expiresAt: at(DAY) });
  seed(REJECTED_TOKEN, { status: 'rejected', expiresAt: at(DAY) });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/portal/auth/team-code with an invite token', () => {
  it('answers open for an invite still being filled in (invited or in progress)', async () => {
    expect((await post({ inviteToken: OPEN_TOKEN })).json).toEqual({ ok: true, state: 'open' });
    seed(OPEN_TOKEN, { status: 'invited', expiresAt: at(DAY) });
    expect((await post({ inviteToken: OPEN_TOKEN })).json).toEqual({ ok: true, state: 'open' });
  });

  it.each(['submitted', 'approved', 'converted'])('answers submitted once the packet is in (%s)', async (status) => {
    seed(SUBMITTED_TOKEN, { status, expiresAt: at(DAY) });
    expect((await post({ inviteToken: SUBMITTED_TOKEN })).json).toEqual({ ok: true, state: 'submitted' });
  });

  it('turns down unknown, expired and closed invites with one identical answer', async () => {
    const unknown = await post({ inviteToken: UNKNOWN_TOKEN });
    expect(unknown.json).toEqual({ ok: false });
    for (const token of [EXPIRED_TOKEN, MARKED_EXPIRED_TOKEN, REJECTED_TOKEN]) {
      const closed = await post({ inviteToken: token });
      expect(closed.status).toBe(unknown.status);
      expect(closed.text).toBe(unknown.text);
    }
    // A submitted invite past its expiry no longer counts either.
    seed(SUBMITTED_TOKEN, { status: 'submitted', expiresAt: at(-DAY) });
    expect((await post({ inviteToken: SUBMITTED_TOKEN })).text).toBe(unknown.text);
    // Checking is read-only: it never marks the invite expired.
    expect(inviteSet).not.toHaveBeenCalled();
  });

  it('does not look up values that are not shaped like a token', async () => {
    for (const inviteToken of [42, '', 'short', 'has spaces and more text in it', 'x'.repeat(300)]) {
      expect((await post({ inviteToken })).json).toEqual({ ok: false });
    }
    expect(queryGet).not.toHaveBeenCalled();
  });

  it('works without a team code configured, and an invite token never unlocks the code check', async () => {
    vi.stubEnv('PORTAL_TEAM_CODE', '');
    expect((await post({ inviteToken: OPEN_TOKEN })).json).toEqual({ ok: true, state: 'open' });
    vi.stubEnv('PORTAL_TEAM_CODE', TEAM_CODE);
    expect((await post({ inviteToken: UNKNOWN_TOKEN, code: TEAM_CODE })).json).toEqual({ ok: false });
  });
});

describe('POST /api/portal/auth/team-code with a code', () => {
  it('accepts the configured code, case- and space-insensitive, and rejects others', async () => {
    expect((await post({ code: ` ${TEAM_CODE.toUpperCase()} ` })).json).toEqual({ ok: true });
    expect((await post({ code: 'wrong-code' })).json).toEqual({ ok: false });
    expect((await post({})).json).toEqual({ ok: false });
    expect((await post('not json')).json).toEqual({ ok: false });
    expect((await post('null')).json).toEqual({ ok: false });
  });

  it('fails closed when PORTAL_TEAM_CODE is unset', async () => {
    vi.stubEnv('PORTAL_TEAM_CODE', '');
    expect((await post({ code: TEAM_CODE })).json).toEqual({ ok: false });
  });
});

it('never sends the team code to the client', async () => {
  const bodies = [
    { inviteToken: OPEN_TOKEN },
    { inviteToken: SUBMITTED_TOKEN },
    { inviteToken: EXPIRED_TOKEN },
    { inviteToken: UNKNOWN_TOKEN },
    { code: TEAM_CODE },
    { code: 'wrong-code' },
  ];
  for (const body of bodies) {
    expect((await post(body)).text.toLowerCase()).not.toContain(TEAM_CODE.toLowerCase());
  }
});
