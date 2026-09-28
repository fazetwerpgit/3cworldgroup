import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// The owner's Practice tab: assignments (who has done them) and "Coach was
// wrong" corrections. Owner only; everything stays in the fake Firestore.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/announcements/requireOwner', () => ({ requireOwner: vi.fn() }));

import * as assignments from './assignments/route';
import * as corrections from './corrections/route';
import { GET as sessions } from './route';
import { requireOwner } from '@/lib/announcements/requireOwner';

const mockOwner = requireOwner as unknown as ReturnType<typeof vi.fn>;
let fake: ReturnType<typeof createFakeAskDb>;

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const rep = (displayName: string) => ({ status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName });
const FEEDBACK = 'This was: Skeptic\nScore: 8/10\nResult: No sale\nSkills: Opener 7/10, Discovery 4/10, Objections 5/10, Close 3/10\nWhat worked:\n- "Hi"';

beforeEach(() => {
  mockOwner.mockReset();
  mockOwner.mockResolvedValue({ ok: true, uid: 'o1', name: 'Jacob Owner' });
  fake = createFakeAskDb({
    users: { r1: rep('Ana'), r2: rep('Ben'), gone: { ...rep('Old'), status: 'inactive' } },
    practiceLog: { l1: { uid: 'r1', persona: 'skeptic', personaLabel: 'Skeptic', repName: 'Ana', feedback: FEEDBACK, createdAt: new Date() } },
  });
  state.db = fake.db;
});

describe('practice assignments', () => {
  it('is owner only', async () => {
    mockOwner.mockResolvedValue({ ok: false, error: 'Forbidden: owner access required', status: 403 });
    expect((await assignments.GET(req('/api/portal/knowledge/practice/assignments'))).status).toBe(403);
    expect((await assignments.POST(req('/api/portal/knowledge/practice/assignments', 'POST', {}))).status).toBe(403);
    expect((await corrections.POST(req('/api/portal/knowledge/practice/corrections', 'POST', {}))).status).toBe(403);
  });

  it("sets one for everyone and counts each active rep's practices toward it", async () => {
    const due = chicagoDayKey(new Date(Date.now() + 3 * 86_400_000));
    const path = '/api/portal/knowledge/practice/assignments';
    expect((await assignments.POST(req(path, 'POST', { repUid: 'gone', persona: 'any', count: 2, due }))).status).toBe(400);
    expect((await assignments.POST(req(path, 'POST', { repUid: 'all', persona: 'skeptic', count: 2, due: '2020-01-01' }))).status).toBe(400);
    const res = await assignments.POST(req(path, 'POST', { repUid: 'all', persona: 'skeptic', count: 2, due }));
    expect(res.status).toBe(200);

    // After it was set: two for Ana (one a redo, which doesn't count), none for Ben.
    const later = new Date(Date.now() + 1000);
    fake.docs('practiceLog').set('l2', { uid: 'r1', persona: 'skeptic', createdAt: later });
    fake.docs('practiceLog').set('l3', { uid: 'r1', persona: 'skeptic', createdAt: later, redoOf: 'l2' });
    const { assignments: views, reps } = await (await assignments.GET(req(path))).json();
    expect(reps.map((r: { name: string }) => r.name)).toEqual(['Ana', 'Ben']);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ repUid: null, repName: 'Everyone', personaLabel: 'Skeptic', count: 2, due });
    expect(views[0].reps).toEqual([
      { uid: 'r1', name: 'Ana', done: 1 },
      { uid: 'r2', name: 'Ben', done: 0 },
    ]);

    expect((await assignments.DELETE(req(`${path}?id=${views[0].id}`, 'DELETE'))).status).toBe(200);
    expect(fake.docs('practiceAssignments').size).toBe(0);
  });
});

describe('coach was wrong', () => {
  it('keeps what the coach said beside the owner\'s take, and shows it under that session', async () => {
    const path = '/api/portal/knowledge/practice/corrections';
    expect((await corrections.POST(req(path, 'POST', { logId: 'l1', part: 'score', take: '' }))).status).toBe(400);
    expect((await corrections.POST(req(path, 'POST', { logId: 'l1', part: 'vibes', take: 'x' }))).status).toBe(400);
    expect((await corrections.POST(req(path, 'POST', { logId: 'nope', part: 'score', take: 'x' }))).status).toBe(404);
    const res = await corrections.POST(req(path, 'POST', { logId: 'l1', part: 'discovery', take: 'A 2: no questions at all.' }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    expect(fake.docs('practiceCorrections').get(id)).toMatchObject({
      logId: 'l1',
      part: 'discovery',
      original: 'Discovery 4/10',
      take: 'A 2: no questions at all.',
      personaLabel: 'Skeptic',
    });

    const { sessions: rows } = await (await sessions(req('/api/portal/knowledge/practice'))).json();
    expect(rows[0]).toMatchObject({
      id: 'l1',
      skills: { opener: 7, discovery: 4, objections: 5, close: 3 },
      corrections: [{ id, part: 'discovery', original: 'Discovery 4/10', take: 'A 2: no questions at all.' }],
    });
  });
});
