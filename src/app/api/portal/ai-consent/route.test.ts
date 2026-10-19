import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

// /api/portal/ai-consent: the one-time AI consent (lib/ai/consent). GET reads
// the caller's own state from the gate; POST stamps users/{uid}.aiConsent.{provider}
// once, merged, and keeps the first time on a repeat.

type Doc = Record<string, unknown>;
const state = vi.hoisted(() => ({ users: new Map<string, Record<string, unknown>>() }));

vi.mock('@/lib/firebase/admin', () => {
  const ref = (id: string) => ({ id, get: async () => ({ exists: state.users.has(id), data: () => state.users.get(id) }) });
  return {
    adminDb: {
      collection: () => ({ doc: ref }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { id: string }, data: Doc) => {
            const current = state.users.get(r.id) ?? {};
            const consent = { ...((current.aiConsent as Doc) ?? {}), ...((data.aiConsent as Doc) ?? {}) };
            state.users.set(r.id, { ...current, ...data, aiConsent: consent });
          },
        }),
    },
  };
});
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { GET, POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/portal/ai-consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.users = new Map([['r1', { displayName: 'Dana Rep', status: 'active' }]]);
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Dana Rep', email: '', aiConsent: { deepseek: false, gemini: true } });
});

afterEach(() => vi.restoreAllMocks());

describe('/api/portal/ai-consent', () => {
  it("GET answers the caller's own consent", async () => {
    const res = await GET(new NextRequest('http://localhost/api/portal/ai-consent', { headers: { authorization: 'Bearer t' } }));
    expect(await res.json()).toEqual({ deepseek: false, gemini: true });
  });

  it('passes on the auth failure and writes nothing', async () => {
    mockUser.mockResolvedValueOnce({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await POST(post({ provider: 'deepseek' }))).status).toBe(401);
    expect(state.users.get('r1')?.aiConsent).toBeUndefined();
  });

  it('refuses an unknown provider', async () => {
    expect((await POST(post({ provider: 'openai' }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
    expect(state.users.get('r1')?.aiConsent).toBeUndefined();
  });

  it('stamps the provider once, beside the other, and keeps the first time', async () => {
    const first = await POST(post({ provider: 'deepseek' }));
    expect(first.status).toBe(200);
    const stamped = (state.users.get('r1')?.aiConsent as Doc).deepseek;
    expect(stamped).toBeInstanceOf(Timestamp);

    await POST(post({ provider: 'gemini' }));
    const again = await POST(post({ provider: 'deepseek' }));
    const consent = state.users.get('r1')?.aiConsent as Doc;
    expect(consent.deepseek).toBe(stamped);
    expect(consent.gemini).toBeInstanceOf(Timestamp);
    expect((await again.json()).agreedAt).toBe((stamped as Timestamp).toDate().toISOString());
    expect(state.users.get('r1')?.displayName).toBe('Dana Rep');
  });
});
