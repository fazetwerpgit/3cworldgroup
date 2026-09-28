import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { LINE_JUDGE_PROMPT, PERSONAS, practiceCustomer } from '@/lib/ask/practice';

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

// The rep's current practice, as the knock left it: the page only knows the id.
const SESSION = { sessionId: 's1' };
const SAVED = { uid: 'r1', sessionId: 's1', persona: 'price-shopper', seed: 42, patience: 5, bag: [] };
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

const modelResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Homeowner and coach answers, in order (the line judge has its own queue). */
let answers: Array<Response | Promise<Response>> = [];
/** The line judge's verdicts; an empty queue judges every line OK. */
let verdicts: string[] = [];

function modelAnswers(content: string) {
  answers.push(modelResponse(content));
}

const isJudge = (call: unknown[]) =>
  JSON.parse((call[1] as { body: string }).body).messages[0].content === LINE_JUDGE_PROMPT;
const judgeCalls = () => fetchMock.mock.calls.filter(isJudge);

/** A coach answer in the exact shape (no format retry). */
const coach = (score: number, result = 'No sale') =>
  `Score: ${score}/10\nResult: ${result}\nWhat worked:\n- "Hi, I'm with 3C."\nFix next time: Ask about their bill.\nTry this line: "What are you paying now?"`;

/** The n-th homeowner or coach request (judge calls left out). */
const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls.filter((c) => !isJudge(c))[call][1].body as string);
const practiceLogs = () => [...fake.docs('practiceLog').values()];

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  vi.stubEnv('ASK_API_KEY', 'test-key');
  vi.stubEnv('ASK_BASE_URL', '');
  vi.stubEnv('ASK_MODEL', '');
  vi.stubEnv('E2E_SANDBOX', '');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  answers = [];
  verdicts = [];
  fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
    if (JSON.parse(init.body).messages[0].content === LINE_JUDGE_PROMPT) return modelResponse(verdicts.shift() ?? 'OK');
    return answers.shift() ?? new Response('no answer queued', { status: 500 });
  });
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Dana Rep', email: 'dana@x.test', isOwner: false });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  fake = createFakeAskDb({
    knowledgeNotes: { n1: { title: 'Door basics', body: 'Open with the three things.', order: 1 } },
    practiceSessions: { r1: SAVED },
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

  it('asks a separate judge, beside the homeowner, how the rep\'s line landed', async () => {
    modelAnswers('Uh, who are you with?');
    await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    const [call] = judgeCalls();
    const judge = JSON.parse(call[1].body);
    expect(judge.temperature).toBe(0);
    expect(judge.max_tokens).toBe(5);
    expect(judge.messages[1].content).toContain('The homeowner just said: "(opens the door) Yeah?"');
    expect(judge.messages[1].content).toContain('"Hi, I\'m with 3C. Text me at [phone] or [email]."');
    // The knock answers no rep line: nothing to judge.
    fetchMock.mockClear();
    modelAnswers('Hello?');
    await POST(req({ action: 'turn', history: [] }));
    expect(judgeCalls()).toHaveLength(0);
  });

  it('shows the homeowner this door\'s own screen card, whatever the page sent, and the coach sees it too', async () => {
    const card = 'Order screen (practice): Fiber 500 — $75/mo with AutoPay. Real prices come from your order screen.';
    const history = [...PITCH, { role: 'screen', text: 'Order screen: $1/mo' }, { role: 'rep', text: 'It says $75 with AutoPay.' }];
    modelAnswers('Hm, that is about what I pay now.');
    await POST(req({ action: 'turn', ...SESSION, history }));
    expect(sentBody().messages.at(-1)).toEqual({
      role: 'user',
      content: `Hi, I'm with 3C. Text me at [phone] or [email].\n(The rep holds up their phone and you read the screen yourself: ${card})\nIt says $75 with AutoPay.`,
    });

    modelAnswers(coach(7));
    const res = await POST(req({ action: 'feedback', ...SESSION, history, endedBy: 'rep' }));
    expect(sentBody(1).messages[1].content).toContain(`Screen: ${card}\nRep: It says $75 with AutoPay.`);
    expect(fake.docs('practiceLog').get((await res.json()).id)?.turns).toContainEqual({ role: 'screen', text: card });
  });

  it('owns patience: the judge reports, the server counts, and closes the door at 0', async () => {
    verdicts.push('WEAK');
    modelAnswers('Hmm.');
    let res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({ reply: 'Hmm.', ended: false });
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(4);

    // An answer that isn't one of the four words counts as weak.
    verdicts.push('Not sure.');
    modelAnswers('Uh huh.');
    await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(3);

    // A caught lie halves what is left and takes one more: 3 -> 0, and the server shuts the door.
    verdicts.push('LIE');
    modelAnswers('Free? Nothing is free.');
    res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({ reply: "Look, I'm not interested. I've got to go.", ended: true });
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(0);

    // At 0 the door is shut whatever the homeowner says next.
    modelAnswers('Yeah, probably.');
    res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({ reply: "Look, I'm not interested. I've got to go.", ended: true });
  });

  it('counts a line as fair when the judge itself fails', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
      JSON.parse(init.body).messages[0].content === LINE_JUDGE_PROMPT
        ? new Response('down', { status: 503 })
        : modelResponse('Okay, go on.')
    );
    expect(await (await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).json()).toEqual({
      reply: 'Okay, go on.',
      ended: false,
    });
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(5);
  });

  it('shuts the door on abuse at once, and on a goodbye without [END]', async () => {
    verdicts.push('ABUSE');
    modelAnswers('Excuse me? No.');
    let res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toMatchObject({ ended: true });
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(0);

    fake.docs('practiceSessions').set('r1', SAVED);
    verdicts.push('WEAK');
    modelAnswers("I'm good, thanks. Have a nice day.");
    res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({ reply: "I'm good, thanks. Have a nice day.", ended: true });
  });

  it('tells the homeowner, hidden, when the rep quotes a price the screen did not show, and counts it a lie', async () => {
    const card = { role: 'screen', text: 'card' };
    modelAnswers('Wait, the screen said 75.');
    await POST(req({ action: 'turn', ...SESSION, history: [...PITCH, card, { role: 'rep', text: 'So $45 a month with AutoPay.' }] }));
    expect(sentBody().messages.at(-1).content).toContain(
      '[Note only you know: the rep just said $45, but the screen they showed you said $75.]'
    );
    // The judge said OK (the default), but a wrong price is a lie in code: 5 -> 1.
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(1);

    fake.docs('practiceSessions').set('r1', SAVED);
    modelAnswers('Where is that from?');
    await POST(req({ action: 'turn', ...SESSION, history: [...PITCH, { role: 'rep', text: "It's 45 dollars." }] }));
    expect(sentBody(1).messages.at(-1).content).toContain(
      "the rep quoted $45 but hasn't shown you anything. You have no idea where that number comes from: ask them where it comes from"
    );

    fake.docs('practiceSessions').set('r1', SAVED);
    modelAnswers('Okay.');
    await POST(req({ action: 'turn', ...SESSION, history: [...PITCH, card, { role: 'rep', text: '$75 with AutoPay.' }] }));
    expect(sentBody(2).messages.at(-1).content).not.toContain('Note only you know');
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(5);
  });

  it('hands over the price card only on Pull up price, and the homeowner then answers the card', async () => {
    const res = await POST(req({ action: 'price', ...SESSION }));
    expect(await res.json()).toEqual({
      card: 'Order screen (practice): Fiber 500 — $75/mo with AutoPay. Real prices come from your order screen.',
    });
    expect((await POST(req({ action: 'price', sessionId: 'old' }))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();

    modelAnswers('Seventy-five, huh.');
    const turn = await POST(req({ action: 'turn', ...SESSION, history: [...PITCH, { role: 'screen', text: 'card' }] }));
    expect(turn.status).toBe(200);
    expect(sentBody().messages.at(-1).content).toContain('(The rep holds up their phone and you read the screen yourself: Order screen (practice)');
  });

  it("draws a rep's homeowner server side from a shuffle bag: all nine before a repeat, never twice in a row", async () => {
    const drawn: string[] = [];
    for (let i = 0; i < 27; i += 1) {
      modelAnswers('Yeah?');
      // A rep asking for a persona is ignored.
      const res = await POST(req({ action: 'turn', history: [], persona: 'renter' }));
      const reply = await res.json();
      // Nothing that tells the persona: no voice settings, no price card.
      expect(Object.keys(reply).sort()).toEqual(['ended', 'reply', 'sessionId']);
      const saved = fake.docs('practiceSessions').get('r1')!;
      expect(saved.sessionId).toBe(reply.sessionId);
      expect(saved.patience).toBe(PERSONAS.find((p) => p.id === saved.persona)!.patience);
      // The picks are kept with the session, and are what the seed draws.
      const customer = practiceCustomer(saved.persona as never, saved.seed as number);
      expect(saved.homeowner).toEqual({
        name: customer.name,
        voice: customer.ttsVoice,
        provider: customer.provider,
        bill: customer.bill,
        details: customer.details,
      });
      drawn.push(saved.persona as string);
    }
    for (let round = 0; round < 3; round += 1) {
      expect(new Set(drawn.slice(round * 9, round * 9 + 9)).size).toBe(9);
    }
    for (let i = 1; i < drawn.length; i += 1) expect(drawn[i]).not.toBe(drawn[i - 1]);
    // The first knock replaced the saved session: its id no longer works.
    expect((await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).status).toBe(409);
  });

  it('lets an owner pick the homeowner to demo, and tells the coach who it was first', async () => {
    mockUser.mockResolvedValue({ ok: true, uid: 'o1', name: 'Jacob Owner', email: '', isOwner: true });
    modelAnswers('Hello?');
    const knock = await (await POST(req({ action: 'turn', history: [], persona: 'att-fiber' }))).json();
    expect(fake.docs('practiceSessions').get('o1')).toMatchObject({ persona: 'att-fiber', sessionId: knock.sessionId });

    modelAnswers(coach(9, 'Walked away the right way'));
    const res = await POST(req({ action: 'feedback', sessionId: knock.sessionId, history: PITCH, endedBy: 'rep' }));
    expect((await res.json()).feedback).toMatch(/^This was: Already has AT&T Fiber\nScore: 9\/10\nResult: Walked away the right way\n/);
  });

  it('refuses a turn that is not an answer to the rep, a bad transcript, or a stale session', async () => {
    expect((await POST(req({ action: 'turn', ...SESSION, history: PITCH.slice(0, 1) }))).status).toBe(400);
    expect((await POST(req({ action: 'turn', ...SESSION, history: [{ role: 'user', text: 'hi' }] }))).status).toBe(400);
    expect((await POST(req({ action: 'feedback', ...SESSION, history: PITCH.slice(0, 1), endedBy: 'rep' }))).status).toBe(400);
    expect((await POST(req({ action: 'feedback', ...SESSION, history: PITCH }))).status).toBe(400);
    expect((await POST(req({ action: 'turn', sessionId: 'old', history: PITCH }))).status).toBe(409);
    expect((await POST(req({ action: 'feedback', history: PITCH, endedBy: 'rep' }))).status).toBe(409);
    // Another rep's session id is not theirs.
    mockUser.mockResolvedValue({ ok: true, uid: 'r2', name: 'Other Rep', email: '', isOwner: false });
    expect((await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.docs('askUsage').size).toBe(0);
  });

  it('grades against the notes and logs the session with its parsed score', async () => {
    modelAnswers(coach(6));
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect(res.status).toBe(200);
    const { id, score, feedback } = await res.json();
    expect(score).toBe(6);
    // The rep learns who it was first.
    expect(feedback).toMatch(/^This was: Price shopper\nScore: 6\/10/);

    const body = sentBody();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.messages[0].content).toContain('Open with the three things.');
    // The coach never learns the homeowner's name, so it can't slip into the feedback.
    expect(body.messages[0].content).not.toContain(practiceCustomer('price-shopper', 42).name);
    expect(body.messages[0].content).toContain('Type: Price shopper');
    expect(body.messages[0].content).toContain('The rep ended it');
    expect(body.messages[1].content).toContain('Rep: Hi, I\'m with 3C. Text me at [phone] or [email].');

    expect(fake.docs('practiceLog').get(id)).toMatchObject({
      uid: 'r1',
      repName: 'Dana Rep',
      persona: 'price-shopper',
      personaLabel: 'Price shopper',
      score: 6,
      result: 'No sale',
      endedBy: 'rep',
      feedback,
      turns: [PITCH[0], { role: 'rep', text: "Hi, I'm with 3C. Text me at [phone] or [email]." }],
    });
    expect(fake.docs('askLog').size).toBe(0);
  });

  it('never lets a sellable homeowner end as "walked away the right way"', async () => {
    modelAnswers(coach(2, 'Walked away the right way'));
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'homeowner' }));
    const { feedback } = await res.json();
    expect(feedback).toBe(`This was: Price shopper\n${coach(2, 'No sale')}`);
    expect(sentBody().messages[0].content).toContain("The homeowner's last line ended it");
    expect(practiceLogs()[0]).toMatchObject({ feedback, endedBy: 'homeowner' });
  });

  it('asks the coach once more when it breaks the format, and uses the fixed answer', async () => {
    modelAnswers(`${coach(3)}\nHonesty flags: never promise that.`);
    modelAnswers(coach(3));
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect((await res.json()).feedback).toBe(`This was: Price shopper\n${coach(3)}`);
    expect(sentBody(1).messages.at(-1).content).toMatch(/^That broke the format \(an extra line or section/);
    expect(practiceLogs()).toHaveLength(1);
  });

  it('logs a null score when the coach skips the Score line, even after the retry', async () => {
    modelAnswers('Good energy. Ask more questions.');
    modelAnswers('Still no score.');
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect((await res.json()).score).toBeNull();
    expect(practiceLogs()[0].score).toBeNull();
  });

  it('grades a session once: a second request gets the stored result, no model call, no second log', async () => {
    modelAnswers(coach(5));
    const first = await (await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }))).json();
    const second = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'homeowner' }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(practiceLogs()).toHaveLength(1);
  });

  it('a feedback request while another is grading waits for that result instead of grading again', async () => {
    const { promise: answer, resolve } = Promise.withResolvers<Response>();
    answers.push(answer);
    const first = POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    resolve(
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: coach(4) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const [a, b] = await Promise.all([(await first).json(), (await second).json()]);
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(practiceLogs()).toHaveLength(1);
  });

  it('counts model calls on a daily counter of its own (a rep line is 2: homeowner and judge), then 429s', async () => {
    const day = chicagoDayKey(new Date());
    const used = () => fake.docs('askUsage').get(`r1_${day}_practice`)?.count;
    fake.docs('askUsage').set(`r1_${day}`, { uid: 'r1', count: 60 });
    fake.docs('askUsage').set(`r1_${day}_practice`, { uid: 'r1', count: 296 });
    // Ask's 60 are used up; practice still runs.
    modelAnswers('Uh huh.');
    expect((await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).status).toBe(200);
    expect(used()).toBe(298);
    expect(fake.docs('askUsage').get(`r1_${day}`)?.count).toBe(60);
    modelAnswers('Yeah?');
    expect((await POST(req({ action: 'turn', history: [] }))).status).toBe(200);
    expect(used()).toBe(299);

    // One call left: a rep line needs two, so it's refused and nothing is counted or called.
    fetchMock.mockClear();
    const res = await POST(req({ action: 'turn', sessionId: fake.docs('practiceSessions').get('r1')!.sessionId, history: PITCH }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("That's today's practice limit. Back at it tomorrow.");
    expect(used()).toBe(299);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the coach\'s format retry when the day has no calls left for it', async () => {
    fake.docs('askUsage').set(`r1_${chicagoDayKey(new Date())}_practice`, { uid: 'r1', count: 299 });
    modelAnswers(`${coach(3)}\nHonesty flags: extra.`);
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers a friendly 502 when the coach call fails, and logs nothing', async () => {
    answers.push(new Response('overloaded', { status: 503 }));
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("The coach couldn't answer right now. Try again in a minute.");
    expect(practiceLogs()).toHaveLength(0);
    // The failed grading doesn't block a retry.
    modelAnswers(coach(4));
    expect((await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }))).status).toBe(200);
  });
});
