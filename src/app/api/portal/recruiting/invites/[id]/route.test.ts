import { randomBytes } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encryptField } from '@/lib/security/fieldEncryption';
import { hashInviteToken } from '@/lib/recruiting/tokens';

process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');

const state = vi.hoisted(() => ({
  gate: vi.fn(),
  sendEmail: vi.fn(),
  requester: { role: 'owner' } as Record<string, unknown> | null,
  invite: null as Record<string, unknown> | null,
}));

// users/{uid} for the caller, onboardingInvites/{id} as one mutable doc.
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: () =>
        name === 'users'
          ? { get: async () => ({ exists: state.requester !== null, data: () => state.requester }) }
          : {
              get: async () => ({ exists: state.invite !== null, data: () => state.invite }),
              update: async (patch: Record<string, unknown>) => {
                state.invite = { ...state.invite, ...patch };
              },
            },
    }),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: state.gate }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: state.sendEmail, onboardingFrom: () => 'onboarding@test' }));

import { GET, POST } from './route';

const params = { params: Promise.resolve({ id: 'inv-1' }) };
const request = (method: 'GET' | 'POST') =>
  new NextRequest('https://portal.test/api/portal/recruiting/invites/inv-1', {
    method,
    headers: { authorization: 'Bearer token' },
  });
const inDays = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  return { toDate: () => date };
};
const tokenOf = (url: string) => url.split('/onboard/')[1];

beforeEach(() => {
  state.gate.mockResolvedValue({ ok: true, uid: 'mgr-1' });
  state.sendEmail.mockReset().mockResolvedValue({ ok: true });
  state.requester = { role: 'owner' };
  state.invite = {
    candidateEmail: 'hire@example.com',
    status: 'invited',
    ownerId: 'mgr-1',
    tokenHash: hashInviteToken('saved-token'),
    tokenEncrypted: encryptField('saved-token'),
    expiresAt: inDays(5),
  };
});

it('gives the manager back the exact link the invite was created with', async () => {
  state.requester = { role: 'field_rep', fieldRole: 'l1_manager' };
  const response = await GET(request('GET'), params);
  expect(response.status).toBe(200);
  expect((await response.json()).inviteUrl).toBe('https://portal.test/onboard/saved-token');
});

it("keeps another manager's invite link from a manager who did not send it", async () => {
  state.requester = { role: 'field_rep', fieldRole: 'l1_manager' };
  state.invite = { ...state.invite, ownerId: 'someone-else' };
  expect((await GET(request('GET'), params)).status).toBe(403);
  expect((await POST(request('POST'), params)).status).toBe(403);
  expect(state.sendEmail).not.toHaveBeenCalled();
});

it('refuses a rep who cannot manage recruiting', async () => {
  state.requester = { role: 'field_rep', fieldRole: 'entry_level_rep' };
  expect((await GET(request('GET'), params)).status).toBe(403);
});

it('closes the link once the recruit has submitted', async () => {
  state.invite = { ...state.invite, status: 'submitted' };
  expect((await GET(request('GET'), params)).status).toBe(409);
  expect((await POST(request('POST'), params)).status).toBe(409);
});

it('does not hand out an expired link to copy', async () => {
  state.invite = { ...state.invite, expiresAt: inDays(-1) };
  expect((await GET(request('GET'), params)).status).toBe(409);
});

it('re-sends the same link with 14 more days and reopens an expired invite', async () => {
  state.invite = { ...state.invite, status: 'expired', expiresAt: inDays(-3) };
  const response = await POST(request('POST'), params);
  const json = await response.json();

  expect(json).toMatchObject({ inviteUrl: 'https://portal.test/onboard/saved-token', emailSent: true, newLink: false });
  expect(state.invite).toMatchObject({ status: 'invited', tokenHash: hashInviteToken('saved-token') });
  const expires = state.invite?.expiresAt;
  expect(expires instanceof Date && expires.getTime() - Date.now()).toBeGreaterThan(13 * 86_400_000);
  expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'hire@example.com' }));
  expect(state.sendEmail.mock.calls[0][0].htmlBody).toContain('https://portal.test/onboard/saved-token');
});

it('gives an invite from before saved links a fresh link that opens it and can be copied later', async () => {
  delete state.invite?.tokenEncrypted;
  const resent = await (await POST(request('POST'), params)).json();
  const token = tokenOf(resent.inviteUrl);

  expect(resent.newLink).toBe(true);
  expect(token).not.toBe('saved-token');
  expect(state.invite?.tokenHash).toBe(hashInviteToken(token));

  const copied = await (await GET(request('GET'), params)).json();
  expect(copied.inviteUrl).toBe(resent.inviteUrl);
});

it('reports when the email did not go out, with the link to send by hand', async () => {
  state.sendEmail.mockResolvedValue({ ok: false, error: 'postmark_422' });
  const json = await (await POST(request('POST'), params)).json();
  expect(json).toMatchObject({ emailSent: false, inviteUrl: 'https://portal.test/onboard/saved-token' });
});
