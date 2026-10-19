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
vi.mock('@/lib/firebase/admin', () => {
  const read = async () => ({ exists: state.invite !== null, data: () => state.invite });
  const write = (patch: Record<string, unknown>) => {
    // FieldValue.delete() removes the field, as Firestore does.
    const next: Record<string, unknown> = { ...state.invite, ...patch };
    for (const [key, value] of Object.entries(patch)) {
      if ((value as { methodName?: string } | null)?.methodName === 'FieldValue.delete') delete next[key];
    }
    state.invite = next;
  };
  return {
    adminDb: {
      collection: (name: string) => ({
        doc: () =>
          name === 'users'
            ? { get: async () => ({ exists: state.requester !== null, data: () => state.requester }) }
            : {
                get: read,
                update: async (patch: Record<string, unknown>) => write(patch),
                firestore: {
                  runTransaction: async <T,>(run: (transaction: unknown) => Promise<T>) =>
                    run({ get: read, update: (_ref: unknown, patch: Record<string, unknown>) => write(patch) }),
                },
              },
      }),
    },
  };
});
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: state.gate }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: state.sendEmail, onboardingFrom: () => 'onboarding@test' }));

import { GET, POST } from './route';

const params = { params: Promise.resolve({ id: 'inv-1' }) };
const request = (method: 'GET' | 'POST', body?: unknown) =>
  new NextRequest('https://portal.test/api/portal/recruiting/invites/inv-1', {
    method,
    headers: { authorization: 'Bearer token' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
  expect((await response.json()).inviteUrl).toBe('https://www.3cworldgroup.com/onboard/saved-token');
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

  expect(json).toMatchObject({ inviteUrl: 'https://www.3cworldgroup.com/onboard/saved-token', emailSent: true, newLink: false });
  expect(state.invite).toMatchObject({ status: 'invited', tokenHash: hashInviteToken('saved-token') });
  const expires = state.invite?.expiresAt;
  expect(expires instanceof Date && expires.getTime() - Date.now()).toBeGreaterThan(13 * 86_400_000);
  expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'hire@example.com' }));
  expect(state.sendEmail.mock.calls[0][0].htmlBody).toContain('https://www.3cworldgroup.com/onboard/saved-token');
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

it('only replaces an older link the recruit already opened when the manager confirms', async () => {
  delete state.invite?.tokenEncrypted;
  state.invite = { ...state.invite, status: 'in_progress' };
  const refused = await POST(request('POST'), params);
  expect(refused.status).toBe(409);
  expect((await refused.json()).code).toBe('opened_link');
  expect(state.invite?.tokenHash).toBe(hashInviteToken('saved-token'));
  expect(state.sendEmail).not.toHaveBeenCalled();

  const resent = await (await POST(request('POST', { replaceOpenedLink: true }), params)).json();
  expect(resent.newLink).toBe(true);
  expect(state.invite?.tokenHash).toBe(hashInviteToken(tokenOf(resent.inviteUrl)));
  expect(state.sendEmail).toHaveBeenCalledTimes(1);
});

it('sends a fresh link without asking once the opened older link has expired', async () => {
  delete state.invite?.tokenEncrypted;
  state.invite = { ...state.invite, status: 'in_progress', expiresAt: inDays(-1) };
  const resent = await (await POST(request('POST'), params)).json();
  expect(resent.newLink).toBe(true);
});

it('reports when the email did not go out, with the link to send by hand', async () => {
  state.sendEmail.mockResolvedValue({ ok: false, error: 'postmark_422' });
  const json = await (await POST(request('POST'), params)).json();
  expect(json).toMatchObject({ emailSent: false, inviteUrl: 'https://www.3cworldgroup.com/onboard/saved-token' });
});

const isServerTimestamp = (value: unknown) =>
  (value as { methodName?: string } | null)?.methodName === 'FieldValue.serverTimestamp';

it('saves the resend on the invite: sent, when, and the Postmark message id, tagged with the invite id', async () => {
  state.sendEmail.mockResolvedValue({ ok: true, messageId: 'pm-new' });
  await POST(request('POST'), params);
  expect(state.invite).toMatchObject({ emailStatus: 'sent', postmarkMessageId: 'pm-new' });
  expect(isServerTimestamp(state.invite?.emailedAt)).toBe(true);
  expect(state.invite).not.toHaveProperty('emailError');
  expect(state.sendEmail).toHaveBeenCalledWith(
    expect.objectContaining({ tag: 'onboarding-invite', metadata: { inviteId: 'inv-1' } })
  );
});

it('applies a delivery the webhook held because it beat the resend write', async () => {
  state.invite = { ...state.invite, emailStatus: 'sent', postmarkMessageId: 'pm-old' };
  state.sendEmail.mockImplementation(async () => {
    // Postmark's Delivery webhook lands before the route saves the send.
    state.invite = {
      ...state.invite,
      heldEmailEvent: { kind: 'delivered', messageId: 'pm-new', at: new Date('2026-10-15T14:00:05Z') },
    };
    return { ok: true, messageId: 'pm-new' };
  });
  await POST(request('POST'), params);
  expect(state.invite).toMatchObject({
    emailStatus: 'delivered',
    postmarkMessageId: 'pm-new',
    deliveredAt: new Date('2026-10-15T14:00:05Z'),
  });
  expect(state.invite).not.toHaveProperty('heldEmailEvent');
});

it('overwrites the last send, including a bounce, when re-sent', async () => {
  state.invite = {
    ...state.invite,
    emailStatus: 'bounced',
    postmarkMessageId: 'pm-old',
    emailedAt: new Date('2026-10-01'),
    deliveredAt: new Date('2026-10-01'),
    bouncedAt: new Date('2026-10-01'),
  };
  state.sendEmail.mockResolvedValue({ ok: true, messageId: 'pm-new' });
  await POST(request('POST'), params);
  expect(state.invite).toMatchObject({ emailStatus: 'sent', postmarkMessageId: 'pm-new' });
  expect(state.invite).not.toHaveProperty('bouncedAt');
  expect(state.invite).not.toHaveProperty('deliveredAt');

  state.sendEmail.mockResolvedValue({ ok: false, error: 'postmark_422' });
  const json = await (await POST(request('POST'), params)).json();
  expect(json.emailStatus).toBe('failed');
  expect(state.invite).toMatchObject({ emailStatus: 'failed', emailError: 'postmark_422' });
  expect(state.invite).not.toHaveProperty('postmarkMessageId');
  expect(state.invite).not.toHaveProperty('emailedAt');
});

it('never shows the link of an invite made to an existing account, not even to an owner', async () => {
  state.invite = { ...state.invite, accountExistedAtInvite: true };
  const copy = await GET(request('GET'), params);
  expect(copy.status).toBe(409);
  expect(await copy.json()).not.toHaveProperty('inviteUrl');

  const resent = await (await POST(request('POST'), params)).json();
  expect(resent).toMatchObject({ emailSent: true });
  expect(resent).not.toHaveProperty('inviteUrl');
  expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'hire@example.com' }));
});
