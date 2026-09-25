import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// POST /api/portal/ask/practice: the Ask 3C gate, its own daily count, the
// homeowner call (fast settings, [END] stripped) and the graded, logged
// session. fetch is stubbed; nothing leaves the process. Every note is made up.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();
let fake: ReturnType<typeof createFakeAskDb>;

const SESSION = { persona: 'price-shopper', seed: 42 };
const PITCH = [
  { role: 'customer', text: '(opens the door) Yeah?' },
  { role: 'rep', text: "Hi, I'm with 3C. Text me at 512-555-0142 or pat@example.com." },
];

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/ask/practice', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function modelAnswers(content: string) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
}

const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body as string);
const practiceLogs = () => [...fake.docs('practiceLog').values()];

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  vi.stubEnv('ASK_API_KEY', 'test-key');
  vi.stubEnv('ASK_BASE_URL', '');
  vi.stubEnv('ASK_MODEL', '');
  vi.stubEnv('E2E_SANDBOX', '');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Dana Rep', email: 'dana@x.test', isOwner: false });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  fake = createFakeAskDb({
    knowledgeNotes: { n1: { title: 'Door basics', body: 'Open with the three things.', order: 1 } },
  });
  state.db = fake.db;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/portal/ask/practice', () => {
  it('404s when Ask 3C is off, before auth or any call', async () => {
    vi.stubEnv('ASK_3C_ENABLED', '');
    expect((await POST(req({ action: 'turn', ...SESSION, history: [] }))).status).toBe(404);
    expect(mockUser).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('in "owners" mode 404s everyone but the owner, without counting a turn', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    expect((await POST(req({ action: 'turn', ...SESSION, history: [] }))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.docs('askUsage').size).toBe(0);

    mockUser.mockResolvedValue({ ok: true, uid: 'o1', name: 'Jacob Owner', email: '', isOwner: true });
    modelAnswers('Yeah?');
    expect((await POST(req({ action: 'turn', ...SESSION, history: [] }))).status).toBe(200);
  });

  it('passes on the auth failure', async () => {
    mockUser.mockResolvedValueOnce({ ok: false, error: 'Account is not active', status: 403 });
    expect((await POST(req({ action: 'turn', ...SESSION, history: [] }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plays the homeowner fast and loose, redacts the rep, and strips [END]', async () => {
    modelAnswers("Fine, Thursday works. I'm in. [END]");
    const res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Fine, Thursday works. I'm in.", ended: true });

    const body = sentBody();
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.temperature).toBe(0.8);
    expect(body.max_tokens).toBe(400);
    expect(body.messages[0].role).toBe('system');
    // The homeowner never sees the playbook.
    expect(body.messages[0].content).not.toContain('Open with the three things.');
    expect(body.messages.slice(2)).toEqual([
      { role: 'assistant', content: '(opens the door) Yeah?' },
      { role: 'user', content: "Hi, I'm with 3C. Text me at [phone] or [email]." },
    ]);
    // A turn is not a finished session.
    expect(practiceLogs()).toHaveLength(0);
  });

  it('refuses a turn that is not an answer to the rep, or a bad transcript', async () => {
    expect((await POST(req({ action: 'turn', ...SESSION, history: PITCH.slice(0, 1) }))).status).toBe(400);
    expect((await POST(req({ action: 'turn', ...SESSION, history: [{ role: 'user', text: 'hi' }] }))).status).toBe(400);
    expect((await POST(req({ action: 'turn', persona: 'ceo', seed: 1, history: [] }))).status).toBe(400);
    expect((await POST(req({ action: 'turn', persona: 'renter', seed: -1, history: [] }))).status).toBe(400);
    expect((await POST(req({ action: 'feedback', ...SESSION, history: PITCH.slice(0, 1), endedBy: 'rep' }))).status).toBe(400);
    expect((await POST(req({ action: 'feedback', ...SESSION, history: PITCH }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('grades against the notes and logs the session with its parsed score', async () => {
    modelAnswers('Score: 6/10\nResult: no sale\nWhat worked:\n- "Hi, I\'m with 3C."\nFix next time: Ask about their bill.\nTry this line: "What are you paying now?"');
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect(res.status).toBe(200);
    const { id, score, feedback } = await res.json();
    expect(score).toBe(6);
    expect(feedback).toMatch(/^Score: 6\/10/);

    const body = sentBody();
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.messages[0].content).toContain('Open with the three things.');
    expect(body.messages[0].content).toContain('Type: Price shopper');
    expect(body.messages[0].content).toContain('The rep ended it');
    expect(body.messages[1].content).toContain('Rep: Hi, I\'m with 3C. Text me at [phone] or [email].');

    expect(fake.docs('practiceLog').get(id)).toMatchObject({
      uid: 'r1',
      repName: 'Dana Rep',
      persona: 'price-shopper',
      personaLabel: 'Price shopper',
      score: 6,
      endedBy: 'rep',
      feedback,
      turns: [PITCH[0], { role: 'rep', text: "Hi, I'm with 3C. Text me at [phone] or [email]." }],
    });
    expect(fake.docs('askLog').size).toBe(0);
  });

  it('never lets a sellable homeowner end as "walked away the right way"', async () => {
    modelAnswers('Score: 2/10\nResult: Walked away the right way\nFix next time: Ask questions.');
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'homeowner' }));
    const { feedback } = await res.json();
    expect(feedback).toBe('Score: 2/10\nResult: No sale\nFix next time: Ask questions.');
    expect(sentBody().messages[0].content).toContain("The homeowner's last line ended it");
    expect(practiceLogs()[0]).toMatchObject({ feedback, endedBy: 'homeowner' });
  });

  it('logs a null score when the coach skips the Score line', async () => {
    modelAnswers('Good energy. Ask more questions.');
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect((await res.json()).score).toBeNull();
    expect(practiceLogs()[0].score).toBeNull();
  });

  it('allows 150 practice calls a day on a counter of its own, then 429s', async () => {
    const day = chicagoDayKey(new Date());
    fake.docs('askUsage').set(`r1_${day}`, { uid: 'r1', count: 60 });
    fake.docs('askUsage').set(`r1_${day}_practice`, { uid: 'r1', count: 149 });
    modelAnswers('Yeah?');
    // Ask's 60 are used up; practice still runs.
    expect((await POST(req({ action: 'turn', ...SESSION, history: [] }))).status).toBe(200);
    expect(fake.docs('askUsage').get(`r1_${day}_practice`)?.count).toBe(150);
    expect(fake.docs('askUsage').get(`r1_${day}`)?.count).toBe(60);

    const res = await POST(req({ action: 'turn', ...SESSION, history: [] }));
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers a friendly 502 when the coach call fails, and logs nothing', async () => {
    fetchMock.mockResolvedValueOnce(new Response('overloaded', { status: 503 }));
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("The coach couldn't answer right now. Try again in a minute.");
    expect(practiceLogs()).toHaveLength(0);
  });
});
