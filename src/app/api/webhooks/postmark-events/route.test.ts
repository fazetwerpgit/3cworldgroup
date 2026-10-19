import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  invites: {} as Record<string, Record<string, unknown>>,
  updates: 0,
}));

// onboardingInvites as a map of docs; transactions read and write it directly.
vi.mock('@/lib/firebase/admin', () => {
  const ref = (id: string) => ({ id });
  return {
    adminDb: {
      collection: () => ({
        doc: (id: string) => ref(id),
        where: (field: string, _op: string, value: unknown) => ({
          limit: () => ({
            get: async () => ({
              docs: Object.entries(state.invites)
                .filter(([, data]) => data[field] === value)
                .map(([id]) => ({ ref: ref(id) })),
            }),
          }),
        }),
      }),
      runTransaction: async <T,>(run: (transaction: unknown) => Promise<T>) =>
        run({
          get: async ({ id }: { id: string }) => ({ exists: id in state.invites, data: () => state.invites[id] }),
          update: ({ id }: { id: string }, patch: Record<string, unknown>) => {
            state.updates += 1;
            state.invites[id] = { ...state.invites[id], ...patch };
          },
        }),
    },
  };
});

import { POST } from './route';

const post = (body: unknown, token: string | null = 'secret') =>
  POST(
    new NextRequest(`https://portal.test/api/webhooks/postmark-events${token === null ? '' : `?token=${token}`}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );

const delivery = (extra: Record<string, unknown> = {}) => ({
  RecordType: 'Delivery',
  MessageID: 'pm-1',
  Tag: 'onboarding-invite',
  Metadata: { inviteId: 'inv-1' },
  DeliveredAt: '2026-10-15T14:00:05Z',
  ...extra,
});
const bounce = (extra: Record<string, unknown> = {}) => ({
  RecordType: 'Bounce',
  Type: 'HardBounce',
  MessageID: 'pm-1',
  Tag: 'onboarding-invite',
  Metadata: { inviteId: 'inv-1' },
  BouncedAt: '2026-10-15T14:00:09Z',
  ...extra,
});

beforeEach(() => {
  vi.stubEnv('POSTMARK_EVENTS_TOKEN', 'secret');
  state.updates = 0;
  state.invites = {
    'inv-1': { status: 'invited', emailStatus: 'sent', postmarkMessageId: 'pm-1', emailedAt: new Date('2026-10-15T14:00:00Z') },
  };
});

it('marks the invite delivered', async () => {
  const response = await post(delivery());
  expect(await response.json()).toEqual({ ok: true, applied: true });
  expect(state.invites['inv-1']).toMatchObject({ emailStatus: 'delivered', deliveredAt: new Date('2026-10-15T14:00:05Z') });
});

it('marks the invite bounced', async () => {
  await post(bounce());
  expect(state.invites['inv-1']).toMatchObject({ emailStatus: 'bounced', bouncedAt: new Date('2026-10-15T14:00:09Z') });
});

it('finds the invite by message id when the event has no metadata', async () => {
  await post(delivery({ Metadata: undefined, Tag: undefined }));
  expect(state.invites['inv-1'].emailStatus).toBe('delivered');
});

it('rejects a missing or wrong token without touching anything', async () => {
  expect((await post(delivery(), null)).status).toBe(401);
  expect((await post(delivery(), 'nope')).status).toBe(401);
  vi.stubEnv('POSTMARK_EVENTS_TOKEN', '');
  expect((await post(delivery(), '')).status).toBe(401);
  expect(state.updates).toBe(0);
});

it('ignores unknown invites, unknown message ids and other emails', async () => {
  for (const body of [
    delivery({ Metadata: { inviteId: 'inv-missing' } }),
    delivery({ Metadata: undefined, Tag: undefined, MessageID: 'pm-unknown' }),
    delivery({ Tag: 'weekly-installs' }),
    { RecordType: 'Open', MessageID: 'pm-1', Metadata: { inviteId: 'inv-1' } },
    'not an event',
  ]) {
    const response = await post(body);
    expect(response.status).toBe(200);
    expect((await response.json()).applied).toBe(false);
  }
  expect(state.updates).toBe(0);
});

it('never lets a later delivery overwrite a bounce', async () => {
  await post(bounce());
  await post(delivery({ DeliveredAt: '2026-10-15T15:00:00Z' }));
  expect(state.invites['inv-1'].emailStatus).toBe('bounced');
  expect(state.invites['inv-1']).not.toHaveProperty('deliveredAt');
});

it('takes a bounce that arrives after a delivery, and ignores repeats', async () => {
  await post(delivery());
  await post(delivery());
  expect(state.updates).toBe(1);
  await post(bounce());
  expect(state.invites['inv-1'].emailStatus).toBe('bounced');
});

it('ignores events from an email sent before the latest resend', async () => {
  await post(bounce({ MessageID: 'pm-old' }));
  expect(state.invites['inv-1'].emailStatus).toBe('sent');

  // No saved message id: an event from long before the latest send is stale.
  state.invites['inv-1'] = { status: 'invited', emailStatus: 'sent', emailedAt: new Date('2026-10-15T14:00:00Z') };
  await post(bounce({ BouncedAt: '2026-10-14T09:00:00Z' }));
  expect(state.invites['inv-1'].emailStatus).toBe('sent');
  await post(delivery());
  expect(state.invites['inv-1'].emailStatus).toBe('delivered');
});

it('leaves the status of failed and older invites alone', async () => {
  state.invites['inv-1'] = { status: 'invited', emailStatus: 'failed', emailError: 'postmark_422' };
  expect((await (await post(delivery({ MessageID: 'pm-x' }))).json()).applied).toBe(false);
  expect(state.invites['inv-1'].emailStatus).toBe('failed');
  state.invites['inv-1'] = { status: 'invited' };
  expect((await (await post(bounce())).json()).applied).toBe(false);
  expect(state.invites['inv-1']).not.toHaveProperty('emailStatus');
});

it('holds an event that arrives before the send result is saved, instead of dropping it', async () => {
  // A new invite: the Delivery webhook beats the write after sendInviteEmail.
  state.invites['inv-1'] = { status: 'invited' };
  const response = await post(delivery());
  expect(response.status).toBe(200);
  expect(state.invites['inv-1'].heldEmailEvent).toEqual({
    kind: 'delivered',
    messageId: 'pm-1',
    at: new Date('2026-10-15T14:00:05Z'),
  });

  // A resend: the doc still holds the previous message id.
  state.invites['inv-1'] = { status: 'invited', emailStatus: 'sent', postmarkMessageId: 'pm-old' };
  await post(bounce());
  expect(state.invites['inv-1'].emailStatus).toBe('sent');
  expect(state.invites['inv-1'].heldEmailEvent).toMatchObject({ kind: 'bounced', messageId: 'pm-1' });
  // A later, lesser event for the same message keeps the bounce.
  await post(delivery());
  expect(state.invites['inv-1'].heldEmailEvent).toMatchObject({ kind: 'bounced', messageId: 'pm-1' });
});

it('does not hold events for the saved send', async () => {
  await post(delivery());
  await post(delivery());
  expect(state.invites['inv-1']).not.toHaveProperty('heldEmailEvent');
});

it('does not treat a delay notice as a bounce', async () => {
  await post(bounce({ Type: 'Transient' }));
  expect(state.invites['inv-1'].emailStatus).toBe('sent');
});
