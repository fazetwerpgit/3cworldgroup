import { describe, expect, it, vi } from 'vitest';
import { MAX_BADGE_CHANNELS, countUnreadChannels, unreadChatBadge } from './unreadBadge';

const ts = (ms: number) => ({ toMillis: () => ms });

describe('countUnreadChannels', () => {
  it('counts channels whose last message is newer than the receipt, or have no receipt', () => {
    const channels = [
      { id: 'a', lastMessageAt: ts(200) }, // read at 100: unread
      { id: 'b', lastMessageAt: ts(100) }, // read at 100: read
      { id: 'c', lastMessageAt: ts(50) }, // no receipt: unread
      { id: 'd', lastMessageAt: null }, // never had a message: never unread
      { id: 'e', lastMessageAt: new Date(10) }, // read later: read
    ];
    const reads = new Map<string, unknown>([
      ['a', ts(100)],
      ['b', ts(100)],
      ['e', new Date(20)],
    ]);
    expect(countUnreadChannels(channels, reads)).toBe(2);
  });

  it('is 0 with no channels', () => {
    expect(countUnreadChannels([], new Map())).toBe(0);
  });
});

function fakeDb(opts: { channels?: Array<Record<string, unknown> & { _id: string }>; reads?: Record<string, unknown>; fail?: boolean }) {
  const limits: number[] = [];
  const snap = (docs: Array<{ id: string; data: Record<string, unknown> }>) => ({
    docs: docs.map((d) => ({ id: d.id, get: (f: string) => d.data[f] })),
  });
  const query = (docs: Array<{ id: string; data: Record<string, unknown> }>) => {
    const q = {
      where: () => q,
      select: () => q,
      limit: (n: number) => {
        limits.push(n);
        return q;
      },
      get: vi.fn(async () => {
        if (opts.fail) throw new Error('boom');
        return snap(docs);
      }),
    };
    return q;
  };
  const channelDocs = (opts.channels ?? []).map(({ _id, ...data }) => ({ id: _id, data }));
  const readDocs = Object.entries(opts.reads ?? {}).map(([id, lastReadAt]) => ({ id, data: { lastReadAt } }));
  const db = {
    collection: (name: string) =>
      name === 'chatChannels' ? query(channelDocs) : { doc: () => ({ collection: () => query(readDocs) }) },
  };
  return { db: db as never, limits };
}

describe('unreadChatBadge', () => {
  it('reads the member channels and receipts, both capped', async () => {
    const { db, limits } = fakeDb({
      channels: [
        { _id: 'general', lastMessageAt: ts(300) },
        { _id: 'doc-x', id: 'sales', lastMessageAt: ts(300) },
      ],
      reads: { general: ts(400) },
    });
    await expect(unreadChatBadge(db, 'u1')).resolves.toBe(1);
    expect(limits).toEqual([MAX_BADGE_CHANNELS, MAX_BADGE_CHANNELS]);
  });

  it('returns null when Firestore fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({ fail: true });
    await expect(unreadChatBadge(db, 'u1')).resolves.toBeNull();
    err.mockRestore();
  });
});
