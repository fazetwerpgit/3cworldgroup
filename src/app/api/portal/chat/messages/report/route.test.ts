import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));

// after() needs a request scope; run the task inline and keep its promise.
const afterTasks = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (task: () => unknown) => afterTasks.push(Promise.resolve(task())) };
});

const notifyMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/chat/moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/chat/moderation')>();
  return { ...actual, notifyChatModerators: notifyMock };
});

// chatChannels/{c}, its messages, and chatReports, keyed by path.
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@/lib/firebase/admin', () => {
  const ref = (path: string) => ({
    id: path.split('/').pop(),
    get: async () => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path) }),
    create: async (data: Record<string, unknown>) => {
      if (store.has(path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      store.set(path, data);
    },
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
  });
  return { adminDb: { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }) } };
});

import { POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const verified = vi.mocked(getVerifiedChatUser);
const REPORTER = { uid: 'rep-1', displayName: 'Rep One', role: undefined, fieldRole: 'entry_rep', canModerate: false } as const;

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/portal/chat/messages/report', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  store.clear();
  afterTasks.length = 0;
  notifyMock.mockClear();
  verified.mockResolvedValue({ ok: true, user: { ...REPORTER } });
  store.set('chatChannels/all-company', { name: 'All Company', audience: 'all', active: true, memberIds: ['rep-1', 'rep-2'] });
  store.set('chatChannels/managers', { name: 'Managers', audience: 'managers', active: true, memberIds: [] });
  store.set('chatChannels/all-company/messages/m1', {
    authorId: 'rep-2',
    authorName: 'Rep Two',
    text: 'something rude',
    attachment: { type: 'image', url: 'https://firebasestorage.googleapis.com/x.png' },
    createdAt: { seconds: 1 },
    deletedAt: null,
  });
  store.set('chatChannels/all-company/messages/own', { authorId: 'rep-1', authorName: 'Rep One', text: 'mine', deletedAt: null });
  store.set('chatChannels/all-company/messages/gone', { authorId: 'rep-2', text: '', deletedAt: { seconds: 2 } });
});

describe('POST /api/portal/chat/messages/report', () => {
  it('passes the auth gate result through', async () => {
    verified.mockResolvedValueOnce({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await post({ channelId: 'all-company', messageId: 'm1', reason: 'spam' })).status).toBe(401);
  });

  it('validates the body', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post({ channelId: 'all-company', reason: 'spam' })).status).toBe(400);
    expect((await post({ channelId: 'a/b', messageId: 'm1', reason: 'spam' })).status).toBe(400);
    expect((await post({ channelId: 'all-company', messageId: 'm1', reason: 'boring' })).status).toBe(400);
    expect((await post({ channelId: 'all-company', messageId: 'm1', reason: 'other', details: 5 })).status).toBe(400);
    expect((await post({ channelId: 'all-company', messageId: 'm1', reason: 'other', details: 'x'.repeat(501) })).status).toBe(400);
  });

  it('only lets members of the channel report', async () => {
    store.set('chatChannels/managers/messages/m9', { authorId: 'mgr', text: 'hi', deletedAt: null });
    expect((await post({ channelId: 'managers', messageId: 'm9', reason: 'spam' })).status).toBe(403);
    expect((await post({ channelId: 'nope', messageId: 'm1', reason: 'spam' })).status).toBe(404);
  });

  it('refuses own, missing and deleted messages', async () => {
    expect((await post({ channelId: 'all-company', messageId: 'own', reason: 'spam' })).status).toBe(400);
    expect((await post({ channelId: 'all-company', messageId: 'missing', reason: 'spam' })).status).toBe(404);
    expect((await post({ channelId: 'all-company', messageId: 'gone', reason: 'spam' })).status).toBe(404);
  });

  it('stores one snapshot report per reporter and alerts the back office once', async () => {
    const res = await post({ channelId: 'all-company', messageId: 'm1', reason: 'harassment', details: '  keeps doing it ' });
    expect(res.status).toBe(200);
    await Promise.all(afterTasks);

    const report = store.get('chatReports/m1_rep-1');
    expect(report).toMatchObject({
      messageId: 'm1',
      channelId: 'all-company',
      channelName: 'All Company',
      reporterUid: 'rep-1',
      reason: 'harassment',
      details: 'keeps doing it',
      messageText: 'something rude',
      attachmentUrl: 'https://firebasestorage.googleapis.com/x.png',
      attachmentType: 'image',
      authorId: 'rep-2',
      authorName: 'Rep Two',
      status: 'open',
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(notifyMock.mock.calls[0])).not.toContain('something rude');
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'rep-1', excludeUids: ['rep-2'] }));

    const again = await post({ channelId: 'all-company', messageId: 'm1', reason: 'spam' });
    expect(await again.json()).toEqual({ success: true, duplicate: true });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});
