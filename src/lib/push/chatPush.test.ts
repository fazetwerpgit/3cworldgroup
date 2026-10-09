import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const getAllSizes: number[] = [];
  const adminDb = {
    collection: vi.fn(() => ({ doc: (id: string) => ({ __id: id }) })),
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        update: (ref: { update: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) =>
          ref.update(data),
      })
    ),
    getAll: vi.fn(async (...refs: Array<{ __id: string }>) => {
      getAllSizes.push(refs.length);
      return refs.map((r) => ({
        id: r.__id,
        exists: users.has(r.__id),
        data: () => users.get(r.__id),
      }));
    }),
  };
  const sendPushToTokens = vi.fn(async () => ({ delivered: 1, failed: 0, pruned: 0 }));
  return { users, getAllSizes, adminDb, sendPushToTokens };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToTokens: fake.sendPushToTokens }));

import {
  CHAT_PUSH_BATCH_SIZE,
  buildChatPushBody,
  pushChatMessageOnce,
  resolveChatPushRecipients,
  sendChatPush,
} from './chatPush';

describe('resolveChatPushRecipients', () => {
  it('notifies every member except the author', () => {
    const data = { memberIds: ['author', 'a', 'b'] };
    expect(resolveChatPushRecipients(data, 'author')).toEqual(['a', 'b']);
  });

  it('returns nothing when the author is the only member', () => {
    expect(resolveChatPushRecipients({ memberIds: ['author'] }, 'author')).toEqual([]);
  });

  it('treats a missing or malformed memberIds as an empty roster', () => {
    expect(resolveChatPushRecipients({}, 'author')).toEqual([]);
    expect(resolveChatPushRecipients({ memberIds: 'not-an-array' }, 'author')).toEqual([]);
  });

  it('drops non-string and empty member ids', () => {
    const data = { memberIds: ['a', '', null, 42, undefined, 'b'] };
    expect(resolveChatPushRecipients(data, 'author')).toEqual(['a', 'b']);
  });

  it('de-duplicates a roster that lists the same uid twice', () => {
    expect(resolveChatPushRecipients({ memberIds: ['a', 'a', 'b'] }, 'author')).toEqual(['a', 'b']);
  });

  it('keeps every member, with no cap that would always skip the same people', () => {
    const memberIds = Array.from({ length: 120 }, (_, i) => `user-${i}`);
    expect(resolveChatPushRecipients({ memberIds }, 'nobody')).toHaveLength(120);
  });
});

describe('sendChatPush', () => {
  const managers = { id: 'managers', name: 'Managers', audience: 'managers', order: 4, active: true };
  const payload = { title: 'Managers', body: 'Boss: hi' };

  beforeEach(() => {
    fake.users.clear();
    fake.getAllSizes.length = 0;
    fake.sendPushToTokens.mockClear();
  });

  function pushedTo(): string[] {
    return fake.sendPushToTokens.mock.calls.map((call) => (call as unknown[])[0] as string).sort();
  }

  it('skips members who were demoted or deactivated since they joined', async () => {
    fake.users.set('mgr', { status: 'active', fieldRole: 'l1_manager', pushTokens: ['t-mgr'] });
    fake.users.set('demoted', { status: 'active', fieldRole: 'ae_tier_1', pushTokens: ['t-dem'] });
    fake.users.set('fired', { status: 'inactive', fieldRole: 'l1_manager', pushTokens: ['t-fired'] });
    fake.users.set('extra-rep', { status: 'active', fieldRole: 'entry_rep', pushTokens: ['t-extra'] });

    const totals = await sendChatPush(
      { ...managers, memberIds: ['boss', 'mgr', 'demoted', 'fired', 'extra-rep', 'deleted'], extraMemberIds: ['extra-rep'] },
      'boss',
      payload
    );

    expect(pushedTo()).toEqual(['extra-rep', 'mgr']);
    expect(fake.sendPushToTokens).toHaveBeenCalledWith('mgr', ['t-mgr'], payload, { urgency: 'high' });
    expect(totals).toEqual({ recipients: 2, sent: 2, failed: 0, pruned: 0 });
  });

  it('reaches every member of a big channel, batch by batch', async () => {
    const memberIds = Array.from({ length: 120 }, (_, i) => `u-${i}`);
    for (const id of memberIds) fake.users.set(id, { status: 'active', fieldRole: 'entry_rep', pushTokens: [`t-${id}`] });

    await sendChatPush({ id: 'all-company', name: 'All', audience: 'all', order: 1, active: true, memberIds }, 'boss', payload);

    expect(fake.sendPushToTokens).toHaveBeenCalledTimes(120);
    expect(Math.max(...fake.getAllSizes)).toBeLessThanOrEqual(CHAT_PUSH_BATCH_SIZE);
  });
});

describe('pushChatMessageOnce', () => {
  const channel = { id: 'all-company', name: 'All', audience: 'all', order: 1, active: true, memberIds: ['boss', 'rep'] };
  const payload = { title: 'All', body: 'Boss: secret text' };

  // chatChannels/{c} with its pushLog subcollection: create() rejects an existing
  // doc like the Admin SDK (ALREADY_EXISTS).
  function channelRef() {
    const logs = new Map<string, Record<string, unknown>>();
    const ref = {
      id: 'all-company',
      collection: (name: string) => {
        expect(name).toBe('pushLog');
        return {
          doc: (id: string) => ({
            create: vi.fn(async (data: Record<string, unknown>) => {
              if (logs.has(id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
              logs.set(id, { ...data });
            }),
            set: vi.fn(async (data: Record<string, unknown>) => {
              logs.set(id, { ...logs.get(id), ...data });
            }),
          }),
        };
      },
      logs,
    };
    return ref;
  }

  beforeEach(() => {
    fake.users.clear();
    fake.users.set('rep', { status: 'active', fieldRole: 'entry_rep', pushTokens: ['t-rep'] });
    fake.sendPushToTokens.mockReset();
    fake.sendPushToTokens.mockResolvedValue({ delivered: 1, failed: 1, pruned: 1 });
  });

  it('claims the push log, sends once, and records the counts there', async () => {
    const ref = channelRef();
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const call = () =>
      pushChatMessageOnce(ref as unknown as FirebaseFirestore.DocumentReference, 'boss_m1', channel, 'boss', payload);

    expect(await call()).toBe(true);
    expect(await call()).toBe(false);

    expect(fake.sendPushToTokens).toHaveBeenCalledTimes(1);
    expect(ref.logs.get('boss_m1')).toMatchObject({
      claimedAt: expect.anything(),
      recipients: 1,
      sent: 1,
      failed: 1,
      pruned: 1,
      at: expect.anything(),
    });
    const logged = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('"messageId":"boss_m1"');
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('t-rep');
    log.mockRestore();
  });
});

describe('buildChatPushBody', () => {
  it('prefixes the sender name to the message text', () => {
    expect(buildChatPushBody('Real User', 'hello team')).toBe('Real User: hello team');
  });

  it('truncates long text to 120 characters including the ellipsis', () => {
    const body = buildChatPushBody('Sender', 'x'.repeat(300));
    const said = body.slice('Sender: '.length);
    expect(said).toHaveLength(120);
    expect(said.endsWith('…')).toBe(true);
  });

  it('leaves text of exactly 120 characters untruncated', () => {
    const text = 'y'.repeat(120);
    expect(buildChatPushBody('Sender', text)).toBe(`Sender: ${text}`);
  });

  it('describes an attachment-only message by its kind', () => {
    expect(buildChatPushBody('Sender', '', { type: 'image', url: 'https://x/y.png' })).toBe(
      'Sender sent a photo'
    );
    expect(buildChatPushBody('Sender', '', { type: 'gif', url: 'https://x/y.gif' })).toBe(
      'Sender sent a GIF'
    );
  });

  it('prefers the text over the attachment when a message has both', () => {
    expect(buildChatPushBody('Sender', 'look at this', { type: 'gif', url: 'https://x/y.gif' })).toBe(
      'Sender: look at this'
    );
  });

  it('falls back to a generic body when there is neither text nor attachment', () => {
    expect(buildChatPushBody('Sender', '   ')).toBe('Sender sent a message');
  });
});
