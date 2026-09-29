import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// GET /api/portal/ask/practice/mine: a rep's own last 30 days and open
// assignments, behind the Ask 3C gate.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { GET } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const req = () => new NextRequest('http://localhost/api/portal/ask/practice/mine', { headers: { authorization: 'Bearer t' } });
const DAY = 86_400_000;
const turns = [1, 2, 3].flatMap((n) => [
  { role: 'customer', text: `Answer ${n}.` },
  { role: 'rep', text: `Line ${n}.` },
]);
const feedback = (opener: number) =>
  `Score: 6/10\nResult: No sale\nSkills: Opener ${opener}/10, Discovery 4/10, Objections 5/10, Close 3/10\nWhat worked:\n- "Hi"`;

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Ana', email: '', isOwner: false });
  const now = Date.now();
  state.db = createFakeAskDb({
    practiceLog: {
      a: { uid: 'r1', persona: 'skeptic', personaLabel: 'Skeptic', feedback: feedback(4), score: 6, turns, createdAt: new Date(now - 2 * DAY) },
      b: { uid: 'r1', persona: 'renter', personaLabel: 'Renter', feedback: feedback(8), score: 6, createdAt: new Date(now - DAY), redoOf: 'a' },
      old: { uid: 'r1', persona: 'renter', personaLabel: 'Renter', feedback: feedback(1), createdAt: new Date(now - 40 * DAY) },
      theirs: { uid: 'r2', persona: 'skeptic', personaLabel: 'Skeptic', feedback: feedback(9), createdAt: new Date(now - DAY) },
    },
    practiceAssignments: {
      x: { repUid: null, repName: 'Everyone', persona: 'skeptic', count: 2, due: chicagoDayKey(new Date(now + DAY)), createdAt: new Date(now - 3 * DAY) },
      y: { repUid: 'r2', repName: 'Ben', persona: 'any', count: 1, due: chicagoDayKey(new Date(now + DAY)), createdAt: new Date(now - 3 * DAY) },
    },
  }).db;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/portal/ask/practice/mine', () => {
  it('404s in "owners" mode for a rep', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    expect((await GET(req())).status).toBe(404);
  });

  it("gives a rep only their own last 30 days, newest first, and their open assignments with what's done", async () => {
    const { sessions, assignments } = await (await GET(req())).json();
    expect(sessions.map((s: { id: string }) => s.id)).toEqual(['b', 'a']);
    expect(sessions[0]).toMatchObject({ redo: true, skills: { opener: 8 } });
    expect(assignments).toEqual([{ id: 'x', persona: 'Skeptic', count: 2, done: 1, due: expect.any(String) }]);
  });
});
