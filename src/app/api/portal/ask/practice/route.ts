import { randomInt, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { askAudience } from '@/lib/ask/flag';
import {
  MAX_PRACTICE_TURNS,
  LINE_JUDGE_PROMPT,
  buildCustomerPrompt,
  buildFeedbackPrompt,
  drawPersona,
  enforceResult,
  feedbackProblem,
  homeownerPicks,
  isPersonaChoice,
  isPersonaId,
  isPracticeSeed,
  judgedEvent,
  lineToJudge,
  parsePracticeHistory,
  parseScore,
  practiceCustomer,
  practiceScreenCard,
  priceNote,
  readCustomerReply,
  revealFeedback,
  stripSentences,
  transcriptText,
  unbackedClaims,
  type PersonaId,
  type PracticeEndedBy,
  type PracticeEvent,
  type PracticeFeedbackReply,
  type PracticeKnockReply,
  type PracticePriceReply,
  type PracticeTurn,
  type PracticeTurnReply,
} from '@/lib/ask/practice';
import {
  STANDARD_DOOR,
  ambientFor,
  asModelLine,
  beatNow,
  buildKidPrompt,
  doorCoachBlock,
  doorPromptBlock,
  doorSummary,
  drawDoor,
  drawDoorKind,
  knockLine,
  parseDoor,
  resultRules,
  splitSpeakers,
  spouseHere,
  surpriseNote,
  type PracticeDoor,
} from '@/lib/ask/practiceDoor';
import { AskProviderError, askProviderConfig, callAskModel, type AskMessage, type AskUsage } from '@/lib/ask/provider';
import { redactContact } from '@/lib/ask/redact';
import { PRACTICE_LOG, PRACTICE_SESSIONS, loadNotes, takeDailyPractice } from '@/lib/ask/store';

// POST /api/portal/ask/practice
//   { action: 'turn', history: [], persona? }          the knock: the server picks who is
//                                                      behind the door and starts the session
//   { action: 'turn', sessionId, history }             the homeowner's next line (history ends
//                                                      with the rep's line or the price card)
//   { action: 'price', sessionId }                     the door's order screen card (Pull up price)
//   { action: 'feedback', sessionId, history, endedBy: 'homeowner'|'rep' }
//                                                      the coach's grade; logs the session once
// Ask 3C Practice: the rep pitches, the model plays a homeowner, then grades
// the pitch against the owner's notes. Reps never choose or see the persona:
// the knock draws it from the rep's shuffle bag (all nine before any repeat)
// and keeps it server side in practiceSessions/{uid} with its seed, the picks
// drawn from it, the homeowner's patience and the bag. The page holds only the
// session id until the feedback reveals who it was. Owners may pick a persona
// (persona, default 'surprise') to demo one. The server owns patience: a line
// judge, called beside the homeowner, says how each rep line landed. Same gate as Ask 3C, its own daily
// count and its own log (practiceLog). Typed emails and phone numbers are
// redacted before the model or the log sees them.

export const runtime = 'nodejs';
export const maxDuration = 60;

const STUB_MODEL = 'sandbox-stub';
const TRY_AGAIN = 'Try again in a minute.';
/** Homeowner lines: quick, and different each time. */
const CUSTOMER_CALL = { think: false, temperature: 0.8, maxTokens: 400 } as const;
/** The line judge: one word, the same answer every time. */
const JUDGE_CALL = { think: false, temperature: 0, maxTokens: 5 } as const;
/** Model calls a knock must leave room for: two rep lines (2 each) and the feedback (1). */
const KNOCK_HEADROOM = 5;
/** The coach gets one retry when its answer breaks the format; both fit in maxDuration. */
const COACH_TIMEOUT_MS = 25_000;
const COACH_RETRY_MIN_MS = 8_000;
/** A second feedback request while the first is grading waits for that result instead of grading again. */
const GRADING_STALE_MS = 60_000;
const GRADING_WAIT_MS = 40_000;
const GRADING_POLL_MS = 500;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function log(event: Record<string, string | number | boolean>) {
  console.info('[ask-3c-practice]', JSON.stringify(event));
}

interface StoredFeedback {
  id: string;
  feedback: string;
  score: number | null;
}

function storedFeedback(value: unknown): StoredFeedback | null {
  const stored = value as Partial<StoredFeedback> | null | undefined;
  return stored && typeof stored.id === 'string' && typeof stored.feedback === 'string'
    ? { id: stored.id, feedback: stored.feedback, score: typeof stored.score === 'number' ? stored.score : null }
    : null;
}

export async function POST(request: NextRequest) {
  const audience = askAudience();
  if (audience === 'off') return fail('Ask 3C is not turned on yet.', 404);

  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (audience === 'owners' && !gate.isOwner) return fail('Ask 3C is not turned on yet.', 404);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  if (action !== 'turn' && action !== 'feedback' && action !== 'price') return fail('Unknown practice action', 400);

  const sessionRef = db.collection(PRACTICE_SESSIONS).doc(gate.uid);
  const saved = (await sessionRef.get()).data() ?? {};
  const current =
    typeof body?.sessionId === 'string' &&
    saved.sessionId === body.sessionId &&
    isPersonaId(saved.persona) &&
    isPracticeSeed(saved.seed)
      ? { sessionId: body.sessionId, personaId: saved.persona, seed: saved.seed }
      : null;
  const over = () => fail('That practice is over. Knock again to start a new one.', 409);

  if (action === 'price') {
    if (!current) return over();
    return NextResponse.json<PracticePriceReply>({
      card: practiceScreenCard(practiceCustomer(current.personaId, current.seed).persona),
    });
  }

  const history = parsePracticeHistory(body?.history);
  if (!history) return fail('Bad practice conversation', 400);
  const knock = action === 'turn' && history.length === 0;
  if (action === 'turn') {
    // The homeowner answers the knock (no lines yet), the rep's last line, or the price card the rep just
    // pulled up, and never runs past the cap.
    if (history.length >= MAX_PRACTICE_TURNS) return fail("That's as long as a practice runs. Get your feedback.", 400);
    if (!knock && history.at(-1)?.role === 'customer') return fail('Say something first', 400);
  } else if (!history.some((turn) => turn.role === 'rep')) {
    return fail('Say something to the homeowner first', 400);
  }
  const endedBy: PracticeEndedBy = body?.endedBy === 'homeowner' ? 'homeowner' : 'rep';
  if (action === 'feedback' && body?.endedBy !== endedBy) return fail('Bad practice ending', 400);

  // Who is behind the door: drawn on the knock, read back from the rep's session after that.
  let sessionId: string;
  let personaId: PersonaId;
  let seed: number;
  let patienceBefore: number;
  let bag: PersonaId[] = [];
  let door: PracticeDoor;
  if (knock) {
    // Only an owner picks; a rep's knock is always a surprise, and so is the kind of door. A landlord door
    // is a renter, drawn outside the shuffle bag (it isn't a turn of the bag).
    const choice = gate.isOwner && isPersonaChoice(body?.persona) ? body.persona : 'surprise';
    const previous = typeof saved.persona === 'string' ? saved.persona : null;
    sessionId = randomUUID();
    seed = randomInt(0, 2 ** 32 - 1);
    const doorKind = choice === 'surprise' ? drawDoorKind(seed, previous) : 'standard';
    if (doorKind === 'landlord') {
      personaId = 'renter';
      bag = Array.isArray(saved.bag) ? saved.bag.filter(isPersonaId) : [];
    } else {
      ({ persona: personaId, bag } = drawPersona(choice, saved.bag, previous, () => randomInt(0, 2 ** 31) / 2 ** 31));
    }
    const drawn = practiceCustomer(personaId, seed);
    // An owner's picked homeowner is a plain door (to demo that homeowner); the clock still counts.
    door = choice === 'surprise' ? drawDoor(seed, drawn, doorKind, new Date()) : { ...drawDoor(seed, drawn, 'standard', new Date()), surprise: null };
    patienceBefore = drawn.persona.patience;
  } else {
    if (!current) return over();
    ({ sessionId, personaId, seed } = current);
    door = saved.door ? parseDoor(saved.door) : STANDARD_DOOR;
    const start = practiceCustomer(personaId, seed).persona.patience;
    patienceBefore = Number.isInteger(saved.patience) ? Math.min(start, Math.max(0, saved.patience as number)) : start;
  }

  if (action === 'feedback') {
    // Graded once: a second request (a reload during Thinking…) gets the stored result, or waits for the
    // grading already under way, and never grades or logs again.
    const done = storedFeedback(saved.feedback);
    if (done) return NextResponse.json<PracticeFeedbackReply>(done);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (snap.get('sessionId') !== sessionId) return 'over' as const;
      if (storedFeedback(snap.get('feedback'))) return 'done' as const;
      const gradingAt = Number(snap.get('gradingAt')) || 0;
      if (Date.now() - gradingAt < GRADING_STALE_MS) return 'busy' as const;
      tx.update(sessionRef, { gradingAt: Date.now() });
      return 'mine' as const;
    });
    if (claimed === 'over') return over();
    if (claimed !== 'mine') return waitForFeedback(sessionRef, sessionId);
  }

  const config = askProviderConfig();
  const stub = !config.apiKey && process.env.E2E_SANDBOX === '1';
  const release = () => (action === 'feedback' ? sessionRef.update({ gradingAt: 0 }) : Promise.resolve());
  if (!config.apiKey && !stub) {
    await release();
    return fail('Practice is not set up yet. Call Jeremy or Jacob.', 503);
  }

  const now = new Date();
  // Model calls this request makes: the knock and the coach 1, a rep line 2 (homeowner and line judge). A knock
  // also needs room left for a practice worth having: two rep lines and the feedback.
  const calls = action === 'turn' && !knock ? 2 : 1;
  const headroom = knock ? KNOCK_HEADROOM : 0;
  if (!(await takeDailyPractice(db, gate.uid, now, calls, headroom))) {
    await release();
    return fail("That's today's practice limit. Back at it tomorrow.", 429);
  }

  const customer = practiceCustomer(personaId, seed);
  // The rep's lines lose typed contacts before the model or the log; the homeowner's are the model's own.
  // A screen card is always this door's own card, whatever the page sent.
  const card = practiceScreenCard(customer.persona);
  const turns: PracticeTurn[] = history.map((turn) =>
    turn.role === 'rep'
      ? { role: 'rep', text: redactContact(turn.text) }
      : turn.role === 'screen'
        ? { role: 'screen', text: card }
        : turn
  );
  const started = Date.now();

  if (action === 'turn') {
    let reply: string;
    let event: PracticeEvent | null = null;
    let usage: AskUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
    const kid = door.kind === 'kid';
    // A price that isn't on the screen the homeowner saw: the homeowner hears about it, and it's a lie.
    const note = knock ? null : priceNote(turns, customer);
    // The spouse walking up or an interruption, on the rep line it's due.
    const surprise = knock ? null : surpriseNote(door, turns, customer);
    if (stub) {
      reply = turns.length === 0 ? 'Hi, can I help you?' : 'Sandbox homeowner here. No model was called.';
      event = knock ? null : note ? 'lie' : 'ok';
    } else {
      const system = kid
        ? buildKidPrompt(customer, door)
        : buildCustomerPrompt(customer, patienceBefore, doorPromptBlock(door, customer, turns));
      const messages: AskMessage[] = [{ role: 'system', content: system }];
      // The homeowner's side: the knock, the rep's lines and the screen they were shown, one user message
      // per stretch between the homeowner's own lines (the spouse's lines tagged as the model wrote them).
      let heard = knockLine(door);
      let said: PracticeTurn[] = [];
      for (const turn of turns) {
        if (turn.role === 'customer') {
          said.push(turn);
          continue;
        }
        if (said.length) {
          messages.push({ role: 'user', content: heard }, { role: 'assistant', content: asModelLine(said) });
          heard = '';
          said = [];
        }
        const line = turn.role === 'screen' ? `(The rep holds up their phone and you read the screen yourself: ${turn.text})` : turn.text;
        heard = heard ? `${heard}\n${line}` : line;
      }
      if (said.length) {
        messages.push({ role: 'user', content: heard }, { role: 'assistant', content: asModelLine(said) });
        heard = '';
      }
      messages.push({ role: 'user', content: [heard, note, surprise].filter(Boolean).join('\n') });
      // The judge runs beside the homeowner, so it costs no time. If it fails, the line counts as fair:
      // a network blip isn't the rep's fault.
      const judged = knock
        ? Promise.resolve(null)
        : callAskModel(
            config,
            [
              { role: 'system', content: LINE_JUDGE_PROMPT },
              { role: 'user', content: lineToJudge(turns, customer, kid) },
            ],
            JUDGE_CALL
          )
            .then(({ answer }) => judgedEvent(answer))
            .catch(() => 'ok' as const);
      try {
        const [homeowner, verdict] = await Promise.all([callAskModel(config, messages, CUSTOMER_CALL), judged]);
        ({ answer: reply, usage } = homeowner);
        event = verdict && note && verdict !== 'abuse' ? 'lie' : verdict;
      } catch (error) {
        return providerFailure(error, action, started);
      }
    }
    const { text, ended, patience } = readCustomerReply(reply, patienceBefore, event, seed, kid);
    const lines = splitSpeakers(text, door, spouseHere(door, turns));
    const beat = knock ? null : beatNow(door, turns);
    const outcome: PracticeTurnReply = {
      lines,
      ended,
      ...(ended ? { close: event === 'abuse' || patience === 0 ? ('slam' as const) : ('shut' as const) } : {}),
      ...(beat ? { beat } : {}),
    };
    log({ outcome: 'ok', action, stub, turns: turns.length, ended, patience, event: event ?? 'knock', door: door.kind, ms: Date.now() - started, ...usage });
    if (!knock) {
      // lastLines: the lines POST .../practice/voice will speak.
      await sessionRef.update({ patience, lastLines: lines, updatedAt: now });
      return NextResponse.json<PracticeTurnReply>(outcome);
    }
    // The session exists once the door has opened; a knock that got no answer leaves the last one as it
    // was. The seed fixes every pick; the picks are written out too so they read without the code.
    await sessionRef.set({
      uid: gate.uid,
      sessionId,
      persona: personaId,
      seed,
      patience,
      bag,
      lastLines: lines,
      homeowner: homeownerPicks(customer),
      door,
      startedAt: now,
      updatedAt: now,
    });
    return NextResponse.json<PracticeKnockReply>({
      ...outcome,
      sessionId,
      ring: door.kind === 'ring',
      ambient: ambientFor(customer, door),
    });
  }

  let feedback: string;
  let usage: AskUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
  if (stub) {
    feedback = 'Score: 7/10\nResult: No sale\nWhat worked:\n- "Sandbox: no model was called."\nFix next time: Nothing yet.\nTry this line: "Hi, I\'m with 3C."';
  } else {
    const notes = await loadNotes(db);
    const messages: AskMessage[] = [
      { role: 'system', content: buildFeedbackPrompt(notes, customer, endedBy, { block: doorCoachBlock(door, customer), ...resultRules(customer, door) }) },
      { role: 'user', content: `Grade this practice.\n\nTranscript:\n${transcriptText(turns)}` },
    ];
    try {
      ({ answer: feedback, usage } = await callAskModel(config, messages, { timeoutMs: COACH_TIMEOUT_MS }));
      // One retry when the shape is off (an extra section, a missing one, a price in the Try line), or when it
      // puts words in someone's mouth (a pain point the homeowner never said).
      const invented = unbackedClaims(feedback, turns);
      const problem =
        feedbackProblem(feedback) ??
        (invented.length
          ? `it says someone said something they didn't: "${invented[0]}". Only say the rep or the homeowner said what the transcript shows they said`
          : null);
      const left = maxDuration * 1000 - 5_000 - (Date.now() - started);
      // The retry is one more model call on the day's count; at the limit the first answer stands.
      if (problem && left >= COACH_RETRY_MIN_MS && (await takeDailyPractice(db, gate.uid, now, 1))) {
        log({ outcome: 'coach_format_retry', problem });
        const retry = await callAskModel(
          config,
          [
            ...messages,
            { role: 'assistant', content: feedback },
            { role: 'user', content: `That broke the format (${problem}). Write it again in exactly the required shape, nothing else.` },
          ],
          { timeoutMs: Math.min(COACH_TIMEOUT_MS, left) }
        ).catch(() => null);
        if (retry) feedback = retry.answer;
      }
      // Still putting words in someone's mouth: those sentences go.
      const still = unbackedClaims(feedback, turns);
      if (still.length) {
        log({ outcome: 'coach_claims_stripped', count: still.length });
        feedback = stripSentences(feedback, still);
      }
      feedback = enforceResult(feedback, resultRules(customer, door));
    } catch (error) {
      await release();
      return providerFailure(error, action, started);
    }
  }
  const summary = doorSummary(door, customer);
  feedback = revealFeedback(feedback, customer.persona, summary);
  const score = parseScore(feedback);
  const result = /^\s*result\s*:\s*(.+)$/im.exec(feedback)?.[1].trim() ?? null;
  const ref = await db.collection(PRACTICE_LOG).add({
    uid: gate.uid,
    repName: gate.name,
    persona: customer.persona.id,
    personaLabel: customer.persona.label,
    seed,
    homeowner: homeownerPicks(customer),
    door,
    doorSummary: summary,
    turns,
    endedBy,
    score,
    result,
    feedback,
    model: stub ? STUB_MODEL : config.model,
    createdAt: now,
  });
  const reply: PracticeFeedbackReply = { id: ref.id, feedback, score };
  await sessionRef.update({ feedback: reply, gradingAt: 0, updatedAt: now });
  log({ outcome: 'ok', action, stub, turns: turns.length, score: score ?? -1, ms: Date.now() - started, ...usage });
  return NextResponse.json<PracticeFeedbackReply>(reply);
}

/** Another request is grading this session: its result, once stored. */
async function waitForFeedback(sessionRef: FirebaseFirestore.DocumentReference, sessionId: string) {
  const until = Date.now() + GRADING_WAIT_MS;
  while (Date.now() < until) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, GRADING_POLL_MS);
    await promise;
    const snap = (await sessionRef.get()).data() ?? {};
    if (snap.sessionId !== sessionId) break;
    const done = storedFeedback(snap.feedback);
    if (done) return NextResponse.json<PracticeFeedbackReply>(done);
    if (!snap.gradingAt) return fail(`The coach couldn't answer right now. ${TRY_AGAIN}`, 502);
  }
  return fail(`The coach is still working on it. ${TRY_AGAIN}`, 504);
}

function providerFailure(error: unknown, action: string, started: number) {
  const kind = error instanceof AskProviderError ? error.kind : 'unknown';
  const status = error instanceof AskProviderError ? error.status ?? 0 : 0;
  log({ outcome: 'provider_error', action, kind, status, ms: Date.now() - started });
  const who = action === 'turn' ? 'The homeowner' : 'The coach';
  return kind === 'timeout'
    ? fail(`${who} took too long to answer. ${TRY_AGAIN}`, 504)
    : fail(`${who} couldn't answer right now. ${TRY_AGAIN}`, 502);
}
