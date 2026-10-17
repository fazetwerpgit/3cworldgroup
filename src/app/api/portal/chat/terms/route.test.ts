import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@/lib/firebase/admin', () => {
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  });
  return {
    adminDb: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: (r: ReturnType<typeof ref>) => r.get(),
          set: (r: ReturnType<typeof ref>, data: Record<string, unknown>) => {
            store.set(r.path, { ...store.get(r.path), ...data });
          },
        }),
    },
  };
});

import { GET, POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const verified = vi.mocked(getVerifiedChatUser);
const req = (method: string) => new NextRequest('http://localhost/api/portal/chat/terms', { method });

beforeEach(() => {
  store.clear();
  verified.mockResolvedValue({ ok: true, user: { uid: 'me', displayName: 'Me', canModerate: false, demoAccount: false } });
  store.set('users/me', { status: 'active' });
});

describe('/api/portal/chat/terms', () => {
  it('passes the auth gate result through', async () => {
    verified.mockResolvedValueOnce({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('reports not accepted, then accepted after POST', async () => {
    expect(await (await GET(req('GET'))).json()).toEqual({ acceptedAt: null });
    const accepted = await (await POST(req('POST'))).json();
    expect(typeof accepted.acceptedAt).toBe('string');
    expect(store.get('users/me')?.chatTermsAcceptedAt).toBeInstanceOf(Timestamp);
    expect(await (await GET(req('GET'))).json()).toEqual({ acceptedAt: accepted.acceptedAt });
  });

  it('keeps the first acceptance time', async () => {
    const first = Timestamp.fromDate(new Date('2026-10-01T12:00:00Z'));
    store.set('users/me', { status: 'active', chatTermsAcceptedAt: first });
    expect((await (await POST(req('POST'))).json()).acceptedAt).toBe('2026-10-01T12:00:00.000Z');
  });
});
