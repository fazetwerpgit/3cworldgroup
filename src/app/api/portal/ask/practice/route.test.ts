import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { ABUSE_CLOSES, LINE_JUDGE_PROMPT, PERSONAS, PRACTICE_REGION, practiceCustomer } from '@/lib/ask/practice';

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

/** A reply by the homeowner alone. */
const says = (text: string, close?: 'slam' | 'shut') => ({
  lines: [{ speaker: 'homeowner', text }],
  ended: close !== undefined,
  ...(close ? { close } : {}),
  budgetMs: expect.any(Number),
});

/** A coach answer in the exact shape (no format retry). */
const coach = (score: number, result = 'No sale') =>
  `Score: ${score}/10\nResult: ${result}\nSkills: Opener ${score}/10, Discovery ${score}/10, Objections ${score}/10, Close ${score}/10\nWhat worked:\n- "Hi, I'm with 3C."\nFix next time: Ask about their bill.\nTry this line: "What are you paying now?"`;

/** The n-th homeowner or coach request (judge calls left out). */
const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls.filter((c) => !isJudge(c))[call][1].body as string);
const practiceLogs = () => [...fake.docs('practiceLog').values()];

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  vi.stubEnv('PRACTICE_ENABLED', 'true');
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

  it('stays owners-only when Ask is open to everyone but PRACTICE_ENABLED is not set', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'true');
    vi.stubEnv('PRACTICE_ENABLED', '');
    expect((await POST(req({ action: 'turn', ...SESSION, history: [] }))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

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
    expect(await res.json()).toEqual(says("Fine, Thursday works. I'm in.", 'shut'));

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
      // The math done for the homeowner: $75 against the $82 this homeowner pays.
      content: `Hi, I'm with 3C. Text me at [phone] or [email].\n(The rep holds up their phone and you read the screen yourself: ${card} That's $7 a month less than the $82 you pay now.)\nIt says $75 with AutoPay.`,
    });

    modelAnswers(coach(7));
    const res = await POST(req({ action: 'feedback', ...SESSION, history, endedBy: 'rep' }));
    expect(sentBody(1).messages[1].content).toContain(`Screen: ${card}\nRep: It says $75 with AutoPay.`);
    expect(fake.docs('practiceLog').get((await res.json()).id)?.turns).toContainEqual({ role: 'screen', text: card });
  });

  it('owns patience: the judge reports, the server counts, and closes the door at 0', async () => {
    // Each line a step further on (a line sent again at the same spot counts once).
    let history = PITCH;
    const next = (said: string, line: string) => (history = [...history, { role: 'customer', text: said }, { role: 'rep', text: line }]);
    verdicts.push('WEAK');
    modelAnswers('Hmm.');
    let res = await POST(req({ action: 'turn', ...SESSION, history }));
    expect(await res.json()).toEqual(says('Hmm.'));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(4);

    // An answer that isn't one of the four words counts as weak.
    verdicts.push('Not sure.');
    modelAnswers('Uh huh.');
    await POST(req({ action: 'turn', ...SESSION, history: next('Hmm.', 'So yeah.') }));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(3);

    // A caught lie halves what is left (rounded up) and takes one more: 3 -> 1, the door stays open.
    verdicts.push('LIE');
    modelAnswers('Free? Nothing is free.');
    res = await POST(req({ action: 'turn', ...SESSION, history: next('Uh huh.', "It's free forever.") }));
    expect(await res.json()).toEqual(says('Free? Nothing is free.'));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(1);

    // One more weak line: 0, and the server shuts the door.
    verdicts.push('WEAK');
    modelAnswers('Uh huh.');
    res = await POST(req({ action: 'turn', ...SESSION, history: next('Free? Nothing is free.', 'Anyway.') }));
    expect(await res.json()).toEqual(says("Look, I'm not interested. I've got to go.", 'slam'));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(0);

    // A shut door never opens again.
    res = await POST(req({ action: 'turn', ...SESSION, history: next("Look, I'm not interested. I've got to go.", 'Wait!') }));
    expect(res.status).toBe(409);
  });

  it('counts a line as fair when the judge itself fails', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
      JSON.parse(init.body).messages[0].content === LINE_JUDGE_PROMPT
        ? new Response('down', { status: 503 })
        : modelResponse('Okay, go on.')
    );
    expect(await (await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).json()).toEqual(says('Okay, go on.'));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(5);
  });

  it('shuts the door on abuse at once, and on a goodbye without [END]', async () => {
    verdicts.push('ABUSE');
    modelAnswers("Excuse me? We're done here. [END]");
    let res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    // The server's close, picked by the session seed, whatever the model wrote.
    expect(await res.json()).toEqual(says(ABUSE_CLOSES[42 % ABUSE_CLOSES.length], 'slam'));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(0);

    fake.docs('practiceSessions').set('r1', SAVED);
    verdicts.push('WEAK');
    modelAnswers("I'm good, thanks. Have a nice day.");
    res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual(says("I'm good, thanks. Have a nice day.", 'shut'));
  });

  it('tells the homeowner, hidden, when the rep quotes a price the screen did not show, and counts it a lie', async () => {
    const card = { role: 'screen', text: 'card' };
    modelAnswers('Wait, the screen said 75.');
    await POST(req({ action: 'turn', ...SESSION, history: [...PITCH, card, { role: 'rep', text: 'So $45 a month with AutoPay.' }] }));
    expect(sentBody().messages.at(-1).content).toContain(
      '[Note only you know: the rep just said $45, but the screen they showed you said $75.]'
    );
    // The judge said OK (the default), but a wrong price is a lie in code: 5 -> 2.
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(2);

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

  it('brings the spouse in on their line: a hidden note, their own lines, and "SPOUSE:" in the history after', async () => {
    const door = {
      kind: 'standard',
      clock: 'Tuesday, 6:15 pm. It\'s dinnertime.',
      kidVoice: null,
      surprise: { kind: 'spouse', atLine: 1, voice: 'Charon', name: 'Mike', objection: "We don't sign anything at the door." },
    };
    fake.docs('practiceSessions').set('r1', { ...SAVED, door });
    modelAnswers("Uh, hang on, this is my husband.\nSPOUSE: We don't sign anything at the door.");
    const res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({
      lines: [
        { speaker: 'homeowner', text: 'Uh, hang on, this is my husband.' },
        { speaker: 'spouse', text: "We don't sign anything at the door." },
      ],
      ended: false,
      budgetMs: expect.any(Number),
    });
    const body = sentBody();
    expect(body.messages.at(-1).content).toMatch(/walks up behind you and joins in.*SPOUSE:/);
    expect(body.messages[0].content).toContain("It's Tuesday, 6:15 pm. It's dinnertime.");
    expect(body.messages[0].content).toContain('is on the porch with you now');
    expect(fake.docs('practiceSessions').get('r1')?.lastLines).toHaveLength(2);

    // Next line: the spouse's words go back to the model as it wrote them.
    const history = [...PITCH, { role: 'customer', text: 'Uh, hang on, this is my husband.' }, { role: 'customer', speaker: 'spouse', text: "We don't sign anything at the door." }, { role: 'rep', text: 'Totally fair, nothing gets signed today.' }];
    modelAnswers('Okay.');
    await POST(req({ action: 'turn', ...SESSION, history }));
    expect(sentBody(1).messages.at(-2)).toEqual({
      role: 'assistant',
      content: "Uh, hang on, this is my husband.\nSPOUSE: We don't sign anything at the door.",
    });
  });

  it('interrupts on its line and says so, for the sound', async () => {
    fake.docs('practiceSessions').set('r1', { ...SAVED, door: { kind: 'standard', clock: '', kidVoice: null, surprise: { kind: 'beat', beat: 'phone', atLine: 1 } } });
    modelAnswers('Hang on, my phone. Yeah, what?');
    const res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({ ...says('Hang on, my phone. Yeah, what?'), beat: 'phone' });
    expect(sentBody().messages.at(-1).content).toContain('your phone starts ringing');
  });

  it('plays a kid at a kid door, and never records a Sale there', async () => {
    const door = { kind: 'kid', clock: '', kidVoice: 'Leda', surprise: null };
    fake.docs('practiceSessions').set('r1', { ...SAVED, door });
    modelAnswers("My mom's not home.");
    const res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(await res.json()).toEqual({ lines: [{ speaker: 'kid', text: "My mom's not home." }], ended: false, budgetMs: expect.any(Number) });
    expect(sentBody().messages[0].content).toMatch(/^You are a kid, about ten years old/);
    expect(JSON.parse(fetchMock.mock.calls.find(isJudge)![1].body).messages[1].content).toMatch(/^A child, about ten, answered the door/);

    modelAnswers(coach(9, 'Sale'));
    const graded = await (await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }))).json();
    expect(graded.feedback).toMatch(/^This was: Price shopper \(a kid answered the door\)\nScore: 9\/10\nResult: No sale\n/);
    expect(sentBody(1).messages[0].content).toContain('A kid (about ten) answered');
  });

  it('asks the coach again when it puts words in the homeowner\'s mouth, then cuts what\'s still made up', async () => {
    const invented = coach(5).replace('Fix next time: Ask about their bill.', 'Fix next time: Ask about their bill. The homeowner said their work video calls freeze.');
    modelAnswers(invented);
    modelAnswers(invented);
    const res = await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    const { feedback } = await res.json();
    expect(sentBody(1).messages.at(-1).content).toMatch(/this sentence isn't backed by the transcript: "The homeowner said their work video calls freeze\."/);
    expect(feedback).not.toContain('video calls');
    // The Fix goes whole (what's left of it would dangle). The rep made no claim, so the line in its place
    // is about the weakest skill, not about claims.
    expect(feedback).toContain('Fix next time: Ask more about their internet and what they pay before you pitch');
    expect(practiceLogs()[0].feedback).toBe(feedback);
  });

  it("draws a rep's homeowner server side from a shuffle bag: all nine before a repeat, never twice in a row", async () => {
    const drawn: string[] = [];
    // Every door in order, landlord doors included: a landlord door between two bag draws breaks a repeat.
    const doors: string[] = [];
    for (let i = 0; drawn.length < 27; i += 1) {
      modelAnswers('Yeah?');
      // A rep asking for a persona is ignored.
      const res = await POST(req({ action: 'turn', history: [], persona: 'renter' }));
      const reply = await res.json();
      // Nothing that tells the persona: no voice settings, no price card; only what's heard and seen at the door.
      expect(Object.keys(reply).sort()).toEqual(['ambient', 'budgetMs', 'ended', 'lines', 'ring', 'sessionId']);
      const saved = fake.docs('practiceSessions').get('r1')!;
      expect(saved.sessionId).toBe(reply.sessionId);
      expect(saved.patience).toBe(PERSONAS.find((p) => p.id === saved.persona)!.patience);
      // The picks are kept with the session, and are what the seed draws.
      const customer = practiceCustomer(saved.persona as never, saved.seed as number, PRACTICE_REGION);
      expect(saved.homeowner).toEqual({
        name: customer.name,
        voice: customer.ttsVoice,
        provider: customer.provider,
        bill: customer.bill,
        details: customer.details,
      });
      // A landlord door is a renter drawn outside the bag.
      const kind = (saved.door as { kind: string }).kind;
      if (kind !== 'landlord') drawn.push(saved.persona as string);
      doors.push(kind === 'landlord' ? 'landlord' : (saved.persona as string));
    }
    for (let round = 0; round < 3; round += 1) {
      expect(new Set(drawn.slice(round * 9, round * 9 + 9)).size).toBe(9);
    }
    for (let i = 1; i < doors.length; i += 1) expect(doors[i]).not.toBe(doors[i - 1]);
    // The first knock replaced the saved session: its id no longer works.
    expect((await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).status).toBe(409);
  });

  it('lets an owner pick the homeowner to demo, and tells the coach who it was first', async () => {
    mockUser.mockResolvedValue({ ok: true, uid: 'o1', name: 'Jacob Owner', email: '', isOwner: true });
    modelAnswers('Hello?');
    const knock = await (await POST(req({ action: 'turn', history: [], persona: 'att-fiber' }))).json();
    expect(fake.docs('practiceSessions').get('o1')).toMatchObject({ persona: 'att-fiber', sessionId: knock.sessionId });

    modelAnswers('Already got AT&T Fiber, sorry.');
    await POST(req({ action: 'turn', sessionId: knock.sessionId, history: [{ role: 'customer', text: 'Hello?' }, PITCH[1]] }));
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

  it('keeps how each line landed, and redoes the worst one: the same door, up to that line, patience as it was', async () => {
    // Line 1 fair, line 2 weak (patience 5 -> 4), line 3 fair.
    const lines = ["Hi, I'm with 3C.", 'So yeah, internet.', 'What do you pay now?'];
    let history: Array<{ role: string; text: string; speaker?: string }> = [PITCH[0]];
    verdicts = ['OK', 'WEAK', 'OK'];
    for (const [i, line] of lines.entries()) {
      history = [...history, { role: 'rep', text: line }];
      modelAnswers(`Answer ${i + 1}.`);
      await POST(req({ action: 'turn', ...SESSION, history }));
      history = [...history, { role: 'customer', text: `Answer ${i + 1}.` }];
    }
    expect(fake.docs('practiceSessions').get('r1')?.steps).toEqual([
      { at: 2, event: 'ok', patience: 5 },
      { at: 4, event: 'weak', patience: 5 },
      { at: 6, event: 'ok', patience: 4 },
    ]);
    modelAnswers(coach(4));
    const graded = await (await POST(req({ action: 'feedback', ...SESSION, history, endedBy: 'rep' }))).json();
    expect(graded).toMatchObject({ canRedo: true, skills: { opener: 4, discovery: 4, objections: 4, close: 4 } });

    // Someone else's practice can't be redone.
    mockUser.mockResolvedValueOnce({ ok: true, uid: 'r2', name: 'Other Rep', email: '', isOwner: false });
    expect((await POST(req({ action: 'redo', logId: graded.id }))).status).toBe(404);

    const res = await POST(req({ action: 'redo', logId: graded.id }));
    expect(res.status).toBe(200);
    const redo = await res.json();
    expect(redo).toMatchObject({ history: history.slice(0, 3), ring: false });
    expect(redo.sessionId).not.toBe('s1');
    expect(fake.docs('practiceSessions').get('r1')).toMatchObject({
      sessionId: redo.sessionId,
      persona: 'price-shopper',
      seed: 42,
      patience: 5,
      steps: [],
      redoOf: graded.id,
      redoFrom: 3,
      lastLines: [{ speaker: 'homeowner', text: 'Answer 1.' }],
    });

    // Graded as a redo: the coach sees where it starts, and the log says so.
    const again = [...redo.history, { role: 'rep', text: 'Who do you have for internet now?' }];
    modelAnswers('Spectrum.');
    await POST(req({ action: 'turn', sessionId: redo.sessionId, history: again }));
    modelAnswers(coach(7));
    const second = await (await POST(req({ action: 'feedback', sessionId: redo.sessionId, history: again, endedBy: 'rep' }))).json();
    expect(sentBody(5).messages[1].content).toMatch(
      /This is a redo[\s\S]*Rep: Hi, I'm with 3C\.\nHomeowner: Answer 1\.\n--- The rep redoes the moment from here ---\nRep: Who do you have for internet now\?\nHomeowner: Spectrum\./
    );
    expect(fake.docs('practiceLog').get(second.id)).toMatchObject({ redoOf: graded.id, redoFrom: 3 });
  });

  it('logs the skill scores and the delivery talk mode sent, and teaches the coach the owner\'s corrections', async () => {
    fake.docs('practiceCorrections').set('c1', {
      logId: 'old',
      part: 'score',
      original: '8/10',
      take: 'A 5 at most: they never asked a question.',
      personaLabel: 'Skeptic',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    });
    modelAnswers(coach(6));
    const delivery = { talkMs: 30_000, listenMs: 45_000, words: 75, fillers: { um: 3 }, lines: 4 };
    const { id } = await (await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep', delivery }))).json();
    expect(sentBody().messages[0].content).toContain('the owner says: "A 5 at most: they never asked a question."');
    expect(fake.docs('practiceLog').get(id)).toMatchObject({ skills: { opener: 6, discovery: 6, objections: 6, close: 6 }, delivery });

    // A delivery that makes no sense isn't kept.
    fake.docs('practiceSessions').set('r1', SAVED);
    modelAnswers(coach(6));
    const bad = await (await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep', delivery: { talkMs: -1 } }))).json();
    expect(fake.docs('practiceLog').get(bad.id)?.delivery).toBeNull();
  });

  it("knocks a rep the homeowner type an open assignment asks for, until it's done", async () => {
    const today = chicagoDayKey(new Date());
    fake.docs('practiceAssignments').set('a1', {
      repUid: null,
      repName: 'Everyone',
      persona: 'elderly',
      count: 1,
      due: today,
      createdAt: new Date(Date.now() - 60_000),
    });
    fake.docs('practiceSessions').delete('r1');
    modelAnswers('Hello?');
    await POST(req({ action: 'turn', history: [] }));
    expect(fake.docs('practiceSessions').get('r1')?.persona).toBe('elderly');

    const lines = [1, 2, 3].flatMap((n) => [{ role: 'customer', text: `Answer ${n}.` }, { role: 'rep', text: `Line ${n}.` }]);
    fake.docs('practiceLog').set('l1', { uid: 'r1', persona: 'elderly', createdAt: new Date(), turns: lines });
    modelAnswers('Hello?');
    await POST(req({ action: 'turn', history: [] }));
    expect(fake.docs('practiceSessions').get('r1')?.persona).not.toBe('elderly');
  });

  it('counts a line once when the same spot is sent again (hands-free re-sending firmer words, Try again)', async () => {
    verdicts = ['WEAK', 'WEAK'];
    modelAnswers('Uh huh.');
    await POST(req({ action: 'turn', ...SESSION, history: [PITCH[0], { role: 'rep', text: 'so what do you' }] }));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(4);
    modelAnswers('Spectrum, why?');
    await POST(req({ action: 'turn', ...SESSION, history: [PITCH[0], { role: 'rep', text: 'So what do you have for internet?' }] }));
    expect(fake.docs('practiceSessions').get('r1')).toMatchObject({ patience: 4, lastLines: [{ speaker: 'homeowner', text: 'Spectrum, why?' }] });
    expect(fake.docs('practiceSessions').get('r1')?.steps).toHaveLength(1);
  });

  it('hands-free: writes the cut-in ahead, then plays it on the cut turn with only the judge, once', async () => {
    const before = [PITCH[0]];
    // Only after the homeowner's line, with words to cut into.
    expect((await POST(req({ action: 'cutin', ...SESSION, history: PITCH, partial: 'and so' }))).status).toBe(400);
    expect((await POST(req({ action: 'cutin', ...SESSION, history: before, partial: '' }))).status).toBe(400);

    modelAnswers('Whoa, hang on. What is this about?');
    const res = await POST(req({ action: 'cutin', ...SESSION, history: before, partial: 'So we have fiber and it is really fast and also' }));
    expect(await res.json()).toEqual({ lines: [{ speaker: 'homeowner', text: 'Whoa, hang on. What is this about?' }] });
    expect(sentBody().messages.at(-1).content).toMatch(/^So we have fiber and it is really fast and also\n\(The rep is still talking/);
    expect(fake.docs('practiceSessions').get('r1')?.pendingCut).toMatchObject({ at: 2 });

    // The rep kept going past the budget: the written line plays; the judge alone runs, one call on the day.
    verdicts = ['WEAK'];
    const cutLine = { role: 'rep', text: 'So we have fiber and it is really fast and also the price…' };
    const played = await POST(req({ action: 'turn', ...SESSION, history: [...before, cutLine], cut: true }));
    expect(await played.json()).toEqual(says('Whoa, hang on. What is this about?'));
    expect(fetchMock.mock.calls.filter((c) => !isJudge(c))).toHaveLength(1);
    expect(judgeCalls()).toHaveLength(1);
    expect(fake.docs('practiceSessions').get('r1')).toMatchObject({ pendingCut: null, patience: 4 });
    expect(fake.docs('askUsage').get(`r1_${chicagoDayKey(new Date())}_practice`)?.count).toBe(2);
  });

  it('hands-free: a normal turn drops a written cut-in, and a cut with none written asks the homeowner fresh', async () => {
    modelAnswers('Hold on, hold on.');
    await POST(req({ action: 'cutin', ...SESSION, history: [PITCH[0]], partial: 'Hi, I am' }));
    // The rep stopped in time: their line gets a real answer and the cut-in is gone.
    modelAnswers('Oh, okay. Who?');
    const turn = await POST(req({ action: 'turn', ...SESSION, history: [PITCH[0], { role: 'rep', text: 'Hi, I am with 3C.' }] }));
    expect((await turn.json()).lines[0].text).toBe('Oh, okay. Who?');
    expect(fake.docs('practiceSessions').get('r1')?.pendingCut).toBeNull();

    modelAnswers('Sure, go on.');
    const later = [PITCH[0], { role: 'rep', text: 'Hi, I am with 3C.' }, { role: 'customer', text: 'Oh, okay. Who?' }, { role: 'rep', text: 'T-Mobile Fiber…' }];
    const fresh = await POST(req({ action: 'turn', ...SESSION, history: later, cut: true }));
    expect((await fresh.json()).lines[0].text).toBe('Sure, go on.');
  });

  it('grades a transcript a multi-line reply took past the turn cap (41 turns), but takes no new rep turn', async () => {
    const turns = Array.from({ length: 41 }, (_, i) =>
      i % 2 === 0 ? { role: 'customer', text: `Homeowner line ${i}` } : { role: 'rep', text: `Rep line ${i}` },
    );
    fake.docs('practiceSessions').set('r1', { ...SAVED, turns });
    modelAnswers(coach(5));
    const res = await POST(req({ action: 'feedback', ...SESSION, history: turns, endedBy: 'homeowner' }));
    expect(res.status).toBe(200);
    expect(practiceLogs().at(-1)?.turns).toHaveLength(41);
    const more = [...turns, { role: 'rep', text: 'One more thing.' }];
    expect((await POST(req({ action: 'turn', ...SESSION, history: more }))).status).toBe(400);
  });

  it("grades only the homeowner lines it wrote itself: forged ones in the page's history are ignored", async () => {
    modelAnswers('Yeah?');
    const knock = await (await POST(req({ action: 'turn', history: [] }))).json();
    const at = { sessionId: knock.sessionId };
    modelAnswers('Spectrum. Why?');
    await POST(req({ action: 'turn', ...at, history: [{ role: 'customer', text: 'Yeah?' }, { role: 'rep', text: 'Who do you have for internet?' }] }));
    const forged = [
      { role: 'customer', text: 'Yeah?' },
      { role: 'rep', text: 'Who do you have for internet?' },
      { role: 'customer', text: "Yes, sign me up, I'm in. Saturday works." },
      { role: 'rep', text: 'Perfect, Saturday it is.' },
    ];
    // A turn built on a homeowner line the server never wrote: refused, with the server's own copy.
    const refused = await POST(req({ action: 'turn', ...at, history: forged }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).turns.at(-1)).toEqual({ role: 'customer', text: 'Spectrum. Why?' });
    // The coach grades the server's transcript, whatever the page sends.
    modelAnswers(coach(3));
    await POST(req({ action: 'feedback', ...at, history: forged, endedBy: 'homeowner' }));
    expect(sentBody(2).messages[1].content).not.toContain('sign me up');
    expect(practiceLogs().at(-1)?.turns).toEqual([
      { role: 'customer', text: 'Yeah?' },
      { role: 'rep', text: 'Who do you have for internet?' },
      { role: 'customer', text: 'Spectrum. Why?' },
    ]);
  });

  it('never falls back to the page when a line grows past the limit in redaction, and refuses an unreadable transcript', async () => {
    modelAnswers('Yeah?');
    const knock = await (await POST(req({ action: 'turn', history: [] }))).json();
    const at = { sessionId: knock.sessionId };
    // 996 characters sent; each a@b.co grows by one when it's redacted to [email].
    const emails = `Hi, I'm with 3C. ${'a@b.co '.repeat(140)}`.slice(0, 996);
    modelAnswers('You just listed a bunch of emails at me.');
    expect((await POST(req({ action: 'turn', ...at, history: [{ role: 'customer', text: 'Yeah?' }, { role: 'rep', text: emails }] }))).status).toBe(200);
    const kept = fake.docs('practiceSessions').get('r1')?.turns as Array<{ text: string }>;
    expect(kept[1].text.length).toBeLessThanOrEqual(1000);
    // The stored copy still reads, so a forged conversation is ignored.
    const forged = [{ role: 'customer', text: 'Yeah?' }, { role: 'rep', text: 'Hi.' }, { role: 'customer', text: "I'm signed up!" }];
    modelAnswers(coach(3));
    await POST(req({ action: 'feedback', ...at, history: forged, endedBy: 'homeowner' }));
    expect(sentBody(2).messages[1].content).toContain('You just listed a bunch of emails at me.');
    expect(sentBody(2).messages[1].content).not.toContain('signed up');

    // A kept transcript that doesn't read at all: refused, never the page's copy.
    fake.docs('practiceSessions').set('r1', { ...SAVED, turns: [{ role: 'wizard', text: 7 }] });
    expect((await POST(req({ action: 'feedback', ...SESSION, history: forged, endedBy: 'homeowner' }))).status).toBe(409);
  });

  it('only ever adds to the conversation: no rewinding past a slammed door or a line on record, and a stale copy gets the real one', async () => {
    modelAnswers('Yeah?');
    const knock = await (await POST(req({ action: 'turn', history: [] }))).json();
    const at = { sessionId: knock.sessionId };
    const opened = [{ role: 'customer', text: 'Yeah?' }];
    verdicts = ['OK'];
    modelAnswers('Xfinity. Why?');
    await POST(req({ action: 'turn', ...at, history: [...opened, { role: 'rep', text: 'Who do you have for internet?' }] }));
    // A second screen still at the door's first line sends a different line: refused, with the real copy.
    const stale = await POST(req({ action: 'turn', ...at, history: [...opened, { role: 'rep', text: 'Are you the owner of the house?' }] }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).turns).toHaveLength(3);
    // The same line again, firmed up, replaces it (hands-free, Try again).
    verdicts = ['OK'];
    modelAnswers('Xfinity, about ninety.');
    const again = await POST(req({ action: 'turn', ...at, history: [...opened, { role: 'rep', text: 'Who do you have for internet right now?' }] }));
    expect(again.status).toBe(200);
    expect(fake.docs('practiceSessions').get('r1')?.turns).toHaveLength(3);
    // Reworded (the finished transcript came out different): only when the page names the line it replaces.
    const reworded = [...opened, { role: 'rep', text: 'Which company is your internet with?' }];
    expect((await POST(req({ action: 'turn', ...at, history: reworded }))).status).toBe(409);
    verdicts = ['OK'];
    modelAnswers('Xfinity.');
    const replaced = await POST(req({ action: 'turn', ...at, history: reworded, replacing: 'Who do you have for internet right now?' }));
    expect(replaced.status).toBe(200);
    expect((fake.docs('practiceSessions').get('r1')?.turns as Array<{ text: string }>)[1].text).toBe('Which company is your internet with?');

    // An abusive line stays on record: it can't be sent over, and the shut door stays shut.
    verdicts = ['ABUSE'];
    modelAnswers('Get off my porch.');
    const said = [...opened, { role: 'rep', text: 'Which company is your internet with?' }, { role: 'customer', text: 'Xfinity.' }];
    await POST(req({ action: 'turn', ...at, history: [...said, { role: 'rep', text: 'Shut up, idiot.' }] }));
    expect((await POST(req({ action: 'turn', ...at, history: [...said, { role: 'rep', text: 'Sorry, I meant to say hi.' }] }))).status).toBe(409);
    expect((fake.docs('practiceSessions').get('r1')?.steps as unknown[]).at(-1)).toMatchObject({ event: 'abuse' });
  });

  it('tells a reloaded page which line is still being answered, and stops once the answer is written', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    answers.push(promise);
    const answering = POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    await new Promise((done) => setTimeout(done, 20));
    const mid = await (await POST(req({ action: 'sync', ...SESSION }))).json();
    expect(mid.answering).toEqual({ text: "Hi, I'm with 3C. Text me at [phone] or [email]." });
    resolve(modelResponse('Okay?'));
    await answering;
    expect((await (await POST(req({ action: 'sync', ...SESSION }))).json()).answering).toBeNull();
  });

  it("never puts one screen's feedback on another screen's newer practice", async () => {
    modelAnswers('Yeah?');
    const first = await (await POST(req({ action: 'turn', history: [] }))).json();
    modelAnswers('Okay.');
    const line = [{ role: 'customer', text: 'Yeah?' }, { role: 'rep', text: 'Hi, I am with 3C.' }];
    await POST(req({ action: 'turn', sessionId: first.sessionId, history: line }));
    // Screen 1 ends; while the coach works, screen 2 knocks.
    const { promise: coachDone, resolve: coachAnswers } = Promise.withResolvers<Response>();
    answers.push(coachDone);
    const grading = POST(req({ action: 'feedback', sessionId: first.sessionId, history: line, endedBy: 'rep' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    modelAnswers('Hello?');
    const second = await (await POST(req({ action: 'turn', history: [] }))).json();
    coachAnswers(modelResponse(coach(6)));
    const graded = await (await grading).json();
    expect(graded.score).toBe(6);
    expect(practiceLogs()).toHaveLength(1);
    // Screen 2's practice is untouched: no feedback of screen 1's on it.
    expect(fake.docs('practiceSessions').get('r1')).toMatchObject({ sessionId: second.sessionId });
    expect(fake.docs('practiceSessions').get('r1')?.feedback).toBeUndefined();
  });

  it("names a surprise in the reveal and to the coach only if it happened before the door closed", async () => {
    const door = { kind: 'standard', clock: '', kidVoice: null, surprise: { kind: 'spouse', atLine: 2, voice: 'Charon', name: 'Mike', objection: 'We read everything first.' } };
    fake.docs('practiceSessions').set('r1', { ...SAVED, door });
    modelAnswers(coach(5));
    const early = await (await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }))).json();
    expect(early.feedback).toMatch(/^This was: Price shopper\n/);
    expect(sentBody().messages[0].content).not.toContain('walked up');
  });

  it('never judges pulling up the price as a lie again after an earlier made-up price', async () => {
    verdicts = ['LIE', 'LIE'];
    const lied = [PITCH[0], { role: 'rep', text: "It's only $40 a month." }];
    modelAnswers("Where'd that come from?");
    await POST(req({ action: 'turn', ...SESSION, history: lied }));
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(2);
    modelAnswers("Seventy-five. That's not forty.");
    const shown = await POST(req({ action: 'turn', ...SESSION, history: [...lied, { role: 'customer', text: "Where'd that come from?" }, { role: 'screen', text: 'x' }] }));
    expect((await shown.json()).ended).toBe(false);
    expect(fake.docs('practiceSessions').get('r1')?.patience).toBe(2);
    expect(judgeCalls()).toHaveLength(1);
    // The caught lie caps the grade.
    modelAnswers(coach(8));
    const graded = await (await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }))).json();
    expect(graded.score).toBe(4);
  });

  it('takes a rep who says they want to hurt themselves out of the role-play: kind close, no grade, 988, no Redo', async () => {
    const hurt = [PITCH[0], { role: 'rep', text: 'I want to kill myself, nobody buys from me.' }];
    const res = await (await POST(req({ action: 'turn', ...SESSION, history: hurt }))).json();
    expect(res).toMatchObject({ ended: true, close: 'shut' });
    expect(res.lines[0].text).toContain('988');
    expect(fetchMock).not.toHaveBeenCalled();
    const graded = await (await POST(req({ action: 'feedback', ...SESSION, history: hurt, endedBy: 'homeowner' }))).json();
    expect(graded).toMatchObject({ score: null, canRedo: false });
    expect(graded.feedback).toContain('988');
    expect(graded.feedback).toContain('Jeremy or Jacob');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells a rep stopped by the daily limit that End still works, and the coach not to dock them for it', async () => {
    fake.docs('askUsage').set(`r1_${chicagoDayKey(new Date())}_practice`, { count: 299 });
    const res = await POST(req({ action: 'turn', ...SESSION, history: PITCH }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('Tap End');
    fake.docs('askUsage').set(`r1_${chicagoDayKey(new Date())}_practice`, { count: 290 });
    modelAnswers(coach(5));
    await POST(req({ action: 'feedback', ...SESSION, history: PITCH, endedBy: 'rep' }));
    expect(sentBody().messages[1].content).toContain("hit the day's practice limit");
  });

  it("closes the door in the homeowner's own words when patience runs out, never a fixed line after praise", async () => {
    fake.docs('practiceSessions').set('r1', { ...SAVED, patience: 1 });
    verdicts = ['WEAK'];
    modelAnswers("Sixty? That's way better than what I pay.");
    modelAnswers("Yeah, I think I'm done here. Have a good one.");
    const res = await (await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).json();
    expect(res).toMatchObject({ ended: true, close: 'slam', lines: [{ speaker: 'homeowner', text: "Yeah, I think I'm done here. Have a good one." }] });
    expect(sentBody(1).messages.at(-1).content).toContain('This is your last line');
  });

  it("writes a spouse reply again when it mixes the two up, and puts it right if it's still mixed", async () => {
    const door = { kind: 'standard', clock: '', kidVoice: null, surprise: { kind: 'spouse', atLine: 1, voice: 'Charon', name: 'Mike', objection: 'We read every word before we sign anything.' } };
    fake.docs('practiceSessions').set('r1', { ...SAVED, door });
    // No lead-in from the homeowner: written again, and the second one is right.
    modelAnswers('SPOUSE: We read every word before we sign anything.');
    modelAnswers('Oh, this is my husband.\nSPOUSE: We read every word before we sign anything.');
    const res = await (await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).json();
    expect(res.lines).toEqual([
      { speaker: 'homeowner', text: 'Oh, this is my husband.' },
      { speaker: 'spouse', text: 'We read every word before we sign anything.' },
    ]);
    expect(sentBody(1).messages.at(-1).content).toContain('Write each person on their own line');

    // Wrong twice: fixed in code, with the homeowner's lead-in.
    fake.docs('practiceSessions').set('r1', { ...SAVED, door });
    modelAnswers('SPOUSE: We read every word before we sign anything.');
    modelAnswers('SPOUSE: We read every word before we sign anything.');
    const fixed = await (await POST(req({ action: 'turn', ...SESSION, history: PITCH }))).json();
    expect(fixed.lines[0].speaker).toBe('homeowner');
    expect(fixed.lines.at(-2)).toEqual({ speaker: 'spouse', text: 'We read every word before we sign anything.' });
    expect(fixed.lines.at(-1).speaker).toBe('homeowner');
  });

  it('never lets a sellable homeowner end as "walked away the right way"', async () => {
    // Seed 7: the screen ($75) beats this homeowner's $85 bill, so leaving isn't the right move.
    fake.docs('practiceSessions').set('r1', { ...SAVED, seed: 7 });
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
    fake.docs('askUsage').set(`r1_${day}_practice`, { uid: 'r1', count: 291 });
    // Ask's 60 are used up; practice still runs. A knock needs room for itself, two rep lines and feedback: 6.
    modelAnswers('Yeah?');
    expect((await POST(req({ action: 'turn', history: [] }))).status).toBe(200);
    expect(used()).toBe(292);
    expect(fake.docs('askUsage').get(`r1_${day}`)?.count).toBe(60);
    const sessionId = fake.docs('practiceSessions').get('r1')!.sessionId;
    let history: Array<{ role: string; text: string }> = [{ role: 'customer', text: 'Yeah?' }];
    for (const expected of [294, 296, 298]) {
      modelAnswers('Uh huh.');
      history = [...history, { role: 'rep', text: `Line ${expected}.` }];
      expect((await POST(req({ action: 'turn', sessionId, history }))).status).toBe(200);
      history = [...history, { role: 'customer', text: 'Uh huh.' }];
      expect(used()).toBe(expected);
    }
    // Two left: no room for a new practice.
    expect((await POST(req({ action: 'turn', history: [] }))).status).toBe(429);
    modelAnswers('Uh huh.');
    history = [...history, { role: 'rep', text: 'Line 300.' }];
    expect((await POST(req({ action: 'turn', sessionId, history }))).status).toBe(200);
    history = [...history, { role: 'customer', text: 'Uh huh.' }];
    expect(used()).toBe(300);
    fake.docs('askUsage').set(`r1_${day}_practice`, { uid: 'r1', count: 299 });

    // One call left: a rep line needs two, so it's refused and nothing is counted or called.
    fetchMock.mockClear();
    const res = await POST(req({ action: 'turn', sessionId, history: [...history, { role: 'rep', text: 'One more.' }] }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("That's today's practice limit. Tap End to get your feedback.");
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
