import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));

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

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@/lib/firebase/admin', () => {
  const ref = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop(),
    get: async () => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path) }),
    create: async (data: Record<string, unknown>) => {
      if (store.has(path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      store.set(path, data);
    },
    delete: async () => {
      store.delete(path);
    },
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string) => ({
    doc: (id: string) => ref(`${path}/${id}`),
    limit: () => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
          .map(([key, data]) => ({ id: key.split('/').pop(), data: () => data })),
      }),
    }),
  });
  return { adminDb: { collection: (name: string) => col(name) } };
});

import { DELETE, GET, POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const verified = vi.mocked(getVerifiedChatUser);

function call(handler: typeof POST, method: string, body?: unknown) {
  return handler(
    new NextRequest('http://localhost/api/portal/chat/blocks', {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
}

beforeEach(() => {
  store.clear();
  afterTasks.length = 0;
  notifyMock.mockClear();
  verified.mockResolvedValue({
    ok: true,
    user: { uid: 'me', displayName: 'Me Person', fieldRole: 'entry_rep', canModerate: false },
  });
  store.set('users/other', { displayName: 'Other Person', status: 'active' });
});

describe('/api/portal/chat/blocks', () => {
  it('passes the auth gate result through', async () => {
    verified.mockResolvedValueOnce({ ok: false, error: 'Account is not active', status: 403 });
    expect((await call(POST, 'POST', { uid: 'other' })).status).toBe(403);
  });

  it('validates the target', async () => {
    expect((await call(POST, 'POST', {})).status).toBe(400);
    expect((await call(POST, 'POST', { uid: 'a/b' })).status).toBe(400);
    expect((await call(POST, 'POST', { uid: 'me' })).status).toBe(400);
    expect((await call(POST, 'POST', { uid: 'ghost' })).status).toBe(404);
    expect((await call(DELETE, 'DELETE', {})).status).toBe(400);
  });

  it('blocks once, alerts the back office once, and lists the block', async () => {
    const res = await call(POST, 'POST', { uid: 'other' });
    expect(await res.json()).toEqual({ success: true, name: 'Other Person' });
    await Promise.all(afterTasks);
    expect(store.get('users/me/chatBlocks/other')).toMatchObject({ name: 'Other Person' });
    expect(notifyMock).toHaveBeenCalledTimes(1);

    const again = await call(POST, 'POST', { uid: 'other' });
    expect((await again.json()).duplicate).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);

    const list = await call(GET, 'GET');
    expect(await list.json()).toEqual({ blocked: [{ uid: 'other', name: 'Other Person' }] });
  });

  it('unblocks', async () => {
    store.set('users/me/chatBlocks/other', { name: 'Other Person' });
    expect((await call(DELETE, 'DELETE', { uid: 'other' })).status).toBe(200);
    expect(store.has('users/me/chatBlocks/other')).toBe(false);
  });
});
