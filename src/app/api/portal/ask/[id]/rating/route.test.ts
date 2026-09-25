import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';

// PATCH /api/portal/ask/{id}/rating: only the rep who asked may rate an answer.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { PATCH } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
let fake: ReturnType<typeof createFakeAskDb>;

const rate = (id: string, rating: unknown) =>
  PATCH(
    new NextRequest(`http://localhost/api/portal/ask/${id}/rating`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ rating }),
    }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Dana Rep', email: '', isOwner: false });
  fake = createFakeAskDb({ askLog: { abc123: { uid: 'r1', answer: 'A', rating: null } } });
  state.db = fake.db;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PATCH /api/portal/ask/{id}/rating', () => {
  it('lets the asking rep set and clear their thumbs', async () => {
    expect((await rate('abc123', 'down')).status).toBe(200);
    expect(fake.docs('askLog').get('abc123')?.rating).toBe('down');
    expect((await rate('abc123', null)).status).toBe(200);
    expect(fake.docs('askLog').get('abc123')?.rating).toBeNull();
  });

  it('403s another rep and leaves the rating alone', async () => {
    mockUser.mockResolvedValue({ ok: true, uid: 'r2', name: 'Other', email: '', isOwner: false });
    expect((await rate('abc123', 'up')).status).toBe(403);
    expect(fake.docs('askLog').get('abc123')?.rating).toBeNull();
  });

  it('404s a non-owner in "owners" mode, even on their own answer', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    expect((await rate('abc123', 'up')).status).toBe(404);
    expect(fake.docs('askLog').get('abc123')?.rating).toBeNull();
  });

  it('404s a missing or malformed id, 400s a bad rating', async () => {
    expect((await rate('nope', 'up')).status).toBe(404);
    expect((await rate('..', 'up')).status).toBe(404);
    expect((await rate('abc123', 'meh')).status).toBe(400);
    expect(fake.docs('askLog').get('abc123')?.rating).toBeNull();
  });
});
