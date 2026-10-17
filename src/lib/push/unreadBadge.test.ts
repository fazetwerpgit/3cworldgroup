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
  const orderBys: number[] = [];
  const receiptIds: string[][] = [];
  const channelDocs = (opts.channels ?? []).map(({ _id, ...data }) => ({ id: _id, data }));
  const q = {
    where: () => q,
    select: () => q,
    orderBy: () => {
      orderBys.push(1);
      return q;
    },
    limit: (n: number) => {
      limits.push(n);
      return q;
    },
    get: vi.fn(async () => {
      if (opts.fail) throw new Error('boom');
      return { docs: channelDocs.map((d) => ({ id: d.id, get: (f: string) => d.data[f] })) };
    }),
  };
  const reads = opts.reads ?? {};
  const db = {
    collection: (name: string) =>
      name === 'chatChannels'
        ? q
        : { doc: () => ({ collection: () => ({ doc: (id: string) => ({ __id: id }) }) }) },
    getAll: vi.fn(async (...args: unknown[]) => {
      const refs = args.filter((a): a is { __id: string } => !!a && typeof a === 'object' && '__id' in a);
      receiptIds.push(refs.map((r) => r.__id));
      return refs.map((r) => ({ id: r.__id, exists: r.__id in reads, get: () => reads[r.__id] }));
    }),
  };
  return { db: db as never, limits, orderBys, receiptIds };
}

describe('unreadChatBadge', () => {
  it('reads the member channels (ordered, capped), then only those channels\' receipts', async () => {
    const { db, limits, orderBys, receiptIds } = fakeDb({
      channels: [
        { _id: 'general', lastMessageAt: ts(300) },
        { _id: 'doc-x', id: 'sales', lastMessageAt: ts(300) },
      ],
      reads: { general: ts(400), 'old-channel': ts(1) },
    });
    await expect(unreadChatBadge(db, 'u1')).resolves.toBe(1);
    expect(limits).toEqual([MAX_BADGE_CHANNELS]);
    expect(orderBys).toHaveLength(1);
    expect(receiptIds).toEqual([['general', 'sales']]);
  });

  it('never counts above the member channels, however many receipts exist', async () => {
    const reads: Record<string, unknown> = {};
    for (let i = 0; i < 250; i += 1) reads[`old-${i}`] = ts(1);
    reads.general = ts(500);
    const { db } = fakeDb({ channels: [{ _id: 'general', lastMessageAt: ts(300) }], reads });
    await expect(unreadChatBadge(db, 'u1')).resolves.toBe(0);
  });

  it('is 0 without reading receipts when the person is in no channel', async () => {
    const { db, receiptIds } = fakeDb({ channels: [] });
    await expect(unreadChatBadge(db, 'u1')).resolves.toBe(0);
    expect(receiptIds).toEqual([]);
  });

  it('returns null when Firestore fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({ fail: true });
    await expect(unreadChatBadge(db, 'u1')).resolves.toBeNull();
    err.mockRestore();
  });
});
