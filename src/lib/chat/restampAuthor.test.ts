import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny in-memory Firestore: docs keyed by full path, queried by collection
// (top-level name) or collection group (last collection segment), with
// equality where(), documentId ordering, limit and startAfter.
const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const docs = new Map<string, Data>();

  function getPath(data: Data, path: string): unknown {
    return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Data)[k] : undefined), data);
  }
  function setPath(data: Data, path: string, value: unknown) {
    const keys = path.split('.');
    let cur = data;
    for (const k of keys.slice(0, -1)) {
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k] as Data;
    }
    cur[keys[keys.length - 1]] = value;
  }
  function snapOf(path: string) {
    return { id: path.split('/').pop()!, ref: { path }, data: () => docs.get(path)!, get: (f: string) => getPath(docs.get(path)!, f) };
  }

  type Filter = { field: string; op: string; value: unknown };
  function query(match: (path: string) => boolean, filters: Filter[] = [], max = Infinity, after?: string) {
    return {
      where: (field: string, op: string, value: unknown) => query(match, [...filters, { field, op, value }], max, after),
      orderBy: () => query(match, filters, max, after),
      limit: (n: number) => query(match, filters, n, after),
      startAfter: (snap: { ref: { path: string } }) => query(match, filters, max, snap.ref.path),
      get: async () => {
        const hits = [...docs.keys()]
          .filter(match)
          .filter((p) =>
            filters.every((f) => {
              const v = getPath(docs.get(p)!, f.field);
              return f.op === 'in' ? (f.value as unknown[]).includes(v) : v === f.value;
            })
          )
          .sort()
          .filter((p) => !after || p > after)
          .slice(0, max)
          .map(snapOf);
        return { empty: hits.length === 0, docs: hits };
      },
    };
  }

  const adminDb = {
    collection: (name: string) => query((p) => p.split('/').length === 2 && p.startsWith(`${name}/`)),
    collectionGroup: (name: string) =>
      query((p) => {
        const parts = p.split('/');
        return parts.length >= 2 && parts[parts.length - 2] === name;
      }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (ref: { path: string }, update: Data) =>
          ops.push(() => {
            const data = docs.get(ref.path)!;
            for (const [k, v] of Object.entries(update)) setPath(data, k, v);
          }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { docs, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));

import { restampAuthor, scrubDeletedChatAuthor } from './restampAuthor';

beforeEach(() => {
  fake.docs.clear();
  fake.docs.set('chatChannels/general', { lastMessage: { messageId: 'm1', authorId: 'u1', authorName: 'Old Name', text: 'hi' } });
  fake.docs.set('chatChannels/managers', { lastMessage: { messageId: 'm9', authorId: 'u2', authorName: 'Other', text: 'yo' } });
  fake.docs.set('chatChannels/general/messages/m1', { authorId: 'u1', authorName: 'Old Name', text: 'hi' });
  fake.docs.set('chatChannels/general/messages/m2', { authorId: 'u2', authorName: 'Other', replyTo: { messageId: 'm1', authorName: 'Old Name' } });
  fake.docs.set('users/u2/chatBlocks/u1', { name: 'Old Name', blockedUid: 'u1' });
  fake.docs.set('users/u3/chatBlocks/u1', { name: 'Old Name', blockedUid: 'u1' });
  fake.docs.set('users/u3/chatBlocks/u2', { name: 'Other', blockedUid: 'u2' });
  fake.docs.set('chatReports/m1_u2', { reporterUid: 'u2', reporterName: 'Other', authorId: 'u1', authorName: 'Old Name', messageText: 'hi' });
  fake.docs.set('chatReports/m9_u1', { reporterUid: 'u1', reporterName: 'Old Name', authorId: 'u2', authorName: 'Other', messageText: 'yo' });
});

describe('restampAuthor', () => {
  it('renames the author on messages, reply quotes and the channel preview they wrote', async () => {
    await restampAuthor('u1', { authorName: 'New Name' });
    expect(fake.docs.get('chatChannels/general/messages/m1')?.authorName).toBe('New Name');
    expect((fake.docs.get('chatChannels/general/messages/m2')?.replyTo as { authorName: string }).authorName).toBe('New Name');
    expect((fake.docs.get('chatChannels/general')?.lastMessage as { authorName: string }).authorName).toBe('New Name');
    // Someone else's preview is untouched.
    expect((fake.docs.get('chatChannels/managers')?.lastMessage as { authorName: string }).authorName).toBe('Other');
  });

  it('stamps "Deleted user" on the preview of a deleted person even with no messages left to find', async () => {
    fake.docs.delete('chatChannels/general/messages/m1');
    await restampAuthor('u1', { authorName: 'Deleted user' });
    expect((fake.docs.get('chatChannels/general')?.lastMessage as { authorName: string }).authorName).toBe('Deleted user');
  });

  it('leaves the preview alone for a role-only restamp', async () => {
    await restampAuthor('u1', { authorRole: 'admin' });
    expect((fake.docs.get('chatChannels/general')?.lastMessage as { authorName: string }).authorName).toBe('Old Name');
  });
});

describe('scrubDeletedChatAuthor', () => {
  it("replaces the person's name in others' block lists and in reports, keeping the text snapshot", async () => {
    await scrubDeletedChatAuthor('u1', 'Deleted user');
    expect(fake.docs.get('users/u2/chatBlocks/u1')?.name).toBe('Deleted user');
    expect(fake.docs.get('users/u3/chatBlocks/u1')?.name).toBe('Deleted user');
    expect(fake.docs.get('users/u3/chatBlocks/u2')?.name).toBe('Other');

    expect(fake.docs.get('chatReports/m1_u2')).toMatchObject({ authorName: 'Deleted user', reporterName: 'Other', messageText: 'hi' });
    expect(fake.docs.get('chatReports/m9_u1')).toMatchObject({ reporterName: 'Deleted user', authorName: 'Other', messageText: 'yo' });
  });
});
