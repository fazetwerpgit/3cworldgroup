import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const getAllSizes: number[] = [];
  const adminDb = {
    collection: vi.fn(() => ({ doc: (id: string) => ({ __id: id }) })),
    getAll: vi.fn(async (...refs: Array<{ __id: string }>) => {
      getAllSizes.push(refs.length);
      return refs.map((r) => ({
        id: r.__id,
        exists: users.has(r.__id),
        data: () => users.get(r.__id),
      }));
    }),
  };
  const sendPushToTokens = vi.fn(async () => ({ delivered: 1, failed: 0 }));
  return { users, getAllSizes, adminDb, sendPushToTokens };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToTokens: fake.sendPushToTokens }));

import {
  CHAT_PUSH_BATCH_SIZE,
  buildChatPushBody,
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

    await sendChatPush(
      { ...managers, memberIds: ['boss', 'mgr', 'demoted', 'fired', 'extra-rep', 'deleted'], extraMemberIds: ['extra-rep'] },
      'boss',
      payload
    );

    expect(pushedTo()).toEqual(['extra-rep', 'mgr']);
    expect(fake.sendPushToTokens).toHaveBeenCalledWith('mgr', ['t-mgr'], payload);
  });

  it('reaches every member of a big channel, batch by batch', async () => {
    const memberIds = Array.from({ length: 120 }, (_, i) => `u-${i}`);
    for (const id of memberIds) fake.users.set(id, { status: 'active', fieldRole: 'entry_rep', pushTokens: [`t-${id}`] });

    await sendChatPush({ id: 'all-company', name: 'All', audience: 'all', order: 1, active: true, memberIds }, 'boss', payload);

    expect(fake.sendPushToTokens).toHaveBeenCalledTimes(120);
    expect(Math.max(...fake.getAllSizes)).toBeLessThanOrEqual(CHAT_PUSH_BATCH_SIZE);
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
