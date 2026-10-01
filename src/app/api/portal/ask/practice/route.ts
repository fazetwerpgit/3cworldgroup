import { randomInt, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { practiceAudience } from '@/lib/ask/flag';
import {
  MAX_PRACTICE_TURNS,
  MAX_REP_CHARS,
  LINE_JUDGE_PROMPT,
  buildCustomerPrompt,
  buildFeedbackPrompt,
  drawPersona,
  enforceResult,
  enforceScore,
  feedbackProblem,
  calendarNote,
  fallbackFix,
  freshSeed,
  parseStoredTurns,
  PRACTICE_REGION,
  openerHint,
  OUT_OF_PATIENCE,
  isSelfHarm,
  lieQuotes,
  screenForHomeowner,
  strayCoachSentences,
  transcriptProblem,
  SELF_HARM_FEEDBACK,
  SELF_HARM_REPLY,
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
  type PracticeCutInReply,
  type PracticeCustomer,
  type PracticeRedoReply,
  type PracticeSyncReply,
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
  fixSpouseLines,
  splitSpeakers,
  spouseHere,
  spouseLinesProblem,
  surpriseNote,
  type PracticeDoor,
  type PracticeLine,
} from '@/lib/ask/practiceDoor';
import { SPECULATION_SLACK, nonEchoWords, talkBudgetMs } from '@/lib/ask/practiceHandsFree';
import { AskProviderError, askProviderConfig, callAskModel, type AskMessage, type AskUsage } from '@/lib/ask/provider';
import { redactContact } from '@/lib/ask/redact';
import {
  assignedPersona,
  correctionsBlock,
  openAssignmentsFor,
  parseDelivery,
  parseSkills,
  parseSteps,
  redoPoint,
  type PracticeStep,
} from '@/lib/ask/practiceCoaching';
import {
  PRACTICE_LOG,
  PRACTICE_SESSIONS,
  loadAssignments,
  loadCorrections,
  loadCountedSessions,
  loadNotes,
  takeDailyPractice,
} from '@/lib/ask/store';

// POST /api/portal/ask/practice
//   { action: 'turn', history: [], persona? }          the knock: the server picks who is
//                                                      behind the door and starts the session
//   { action: 'turn', sessionId, history }             the homeowner's next line (history ends
//                                                      with the rep's line or the price card)
//   { action: 'price', sessionId }                     the door's order screen card (Pull up price)
//   { action: 'feedback', sessionId, history, endedBy: 'homeowner'|'rep', delivery? }
//                                                      the coach's grade; logs the session once
//                                                      (delivery: talk mode's timing and words)
//   { action: 'cutin', sessionId, history, partial }   hands-free: the homeowner's interruption of a
//                                                      rep still talking (partial: their words so far),
//                                                      written ahead; { action: 'turn', ..., cut: true }
//                                                      then plays it (history ends with the cut-off line)
//     (a turn may carry replacing: the rep's last line it sends again, reworded; see sameLineAgain)
//   { action: 'sync', sessionId }                      the conversation as the server has it (resume)
//   { action: 'redo', logId }                          "Redo that moment": a new session at the
//                                                      same door, up to its weakest line
// Ask 3C Practice: the rep pitches, the model plays a homeowner, then grades
// the pitch against the owner's notes. Reps never choose or see the persona:
// the knock draws it from the rep's shuffle bag (all nine before any repeat)
// and keeps it server side in practiceSessions/{uid} with its seed, the picks
// drawn from it, the homeowner's patience and the bag. The page holds only the
// session id until the feedback reveals who it was. Owners may pick a persona
// (persona, default 'surprise') to demo one. The server owns patience: a line
// judge, called beside the homeowner, says how each rep line landed (kept as the session's steps, so the
// weakest can be redone). An open assignment of the owner's that names a homeowner type decides a rep's
// knock until it's done. Same gate as Ask 3C, its own daily
// count and its own log (practiceLog). Typed emails and phone numbers are
// redacted before the model or the log sees them. The conversation is the
// server's (practiceSessions.turns, appended as each reply is written): the
// page only adds the rep's new line or the price card, and the coach grades
// the stored copy. Writes to the session check it's still the same session
// (another screen may have knocked since). The score is counted in code from
// the coach's skill scores and capped by what the line judge caught.

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
/** A reply still being written after this long has failed: sync stops showing its line as answering. */
const ANSWERING_MS = 60_000;
/** A rep doesn't meet the same full name twice within this many doors. */
const RECENT_NAMES = 20;
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

function storedFeedback(value: unknown): PracticeFeedbackReply | null {
  const stored = value as Partial<PracticeFeedbackReply> | null | undefined;
  return stored && typeof stored.id === 'string' && typeof stored.feedback === 'string'
    ? {
        id: stored.id,
        feedback: stored.feedback,
        score: typeof stored.score === 'number' ? stored.score : null,
        skills: parseSkills(stored.feedback),
        canRedo: stored.canRedo === true,
      }
    : null;
}

/** The rep's lines as the model saw them: typed contacts redacted, a screen card always this door's own. */
function cleanTurns(history: PracticeTurn[], card: string): PracticeTurn[] {
  return history.map((turn) =>
    turn.role === 'rep'
      ? { role: 'rep', text: redactContact(turn.text).slice(0, MAX_REP_CHARS) }
      : turn.role === 'screen'
        ? { role: 'screen', text: card }
        : turn
  );
}

/**
 * The rep's last line sent again at its own spot, and nothing else: it replaces that line and its answer.
 * Only while the answer was the last thing said, not abuse (that stays on record), and only the same line:
 * every word of the stored one (but a couple) in the new one (retried, or firmed up by hands-free), or the
 * page names the line it replaces (hands-free sent it on the words heard at the pause and the finished
 * transcript came out different). A second screen that never sent that line can't do either.
 */
function sameLineAgain(stored: PracticeTurn[], tail: number, added: PracticeTurn[], steps: PracticeStep[], replacing: unknown): boolean {
  const line = stored[tail];
  if (added.length !== 1 || added[0].role !== 'rep' || line?.role !== 'rep') return false;
  if (!stored.slice(tail + 1).every((turn) => turn.role === 'customer')) return false;
  if (steps.some((step) => step.at === tail + 1 && step.event === 'abuse')) return false;
  if (typeof replacing === 'string' && redactContact(replacing).slice(0, MAX_REP_CHARS) === line.text) return true;
  return nonEchoWords(line.text, redactContact(added[0].text)).length <= SPECULATION_SLACK;
}

/** A reply line as a turn of the conversation: the homeowner's own lines carry no speaker. */
const asTurn = (line: PracticeLine): PracticeTurn =>
  line.speaker === 'spouse' || line.speaker === 'kid' ? { role: 'customer', text: line.text, speaker: line.speaker } : { role: 'customer', text: line.text };

/**
 * Writes to the rep's session only while it is still `sessionId`: another tab
 * or phone may have knocked (a new session) while this request was working.
 * False when it was replaced.
 */
function updateIfCurrent(
  db: FirebaseFirestore.Firestore,
  sessionRef: FirebaseFirestore.DocumentReference,
  sessionId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (snap.get('sessionId') !== sessionId) return false;
    tx.update(sessionRef, data);
    return true;
  });
}

export async function POST(request: NextRequest) {
  const audience = practiceAudience();
  if (audience === 'off') return fail('Ask 3C is not turned on yet.', 404);

  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (audience === 'owners' && !gate.isOwner) return fail('Ask 3C is not turned on yet.', 404);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  if (action !== 'turn' && action !== 'feedback' && action !== 'price' && action !== 'redo' && action !== 'cutin' && action !== 'sync') {
    return fail('Unknown practice action', 400);
  }

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
  // The conversation as the server wrote it: the homeowner's lines are only ever the server's own. The
  // page's copy adds nothing but the rep's new line (or the price card) at the end. Null for a session
  // started before it was kept.
  const keptTurns = current !== null && Array.isArray(saved.turns);
  const stored = keptTurns ? parseStoredTurns(saved.turns) : null;

  if (action === 'price') {
    if (!current) return over();
    return NextResponse.json<PracticePriceReply>({
      card: practiceScreenCard(practiceCustomer(current.personaId, current.seed).persona),
    });
  }

  if (action === 'redo') return startRedo(db, gate.uid, body?.logId, saved, sessionRef);

  // A session whose transcript is kept but unreadable is never graded from the page's copy.
  if (keptTurns && !stored) return over();

  if (action === 'sync') {
    // A reload or Back mid-practice: the conversation as the server has it (a reply that landed while the
    // page was away included), whether the door has closed, and the rep's line still being answered.
    if (!current) return over();
    const answering = saved.answering as { text?: unknown; since?: unknown } | null | undefined;
    const live = answering && typeof answering.text === 'string' && Number(answering.since) > Date.now() - ANSWERING_MS;
    return NextResponse.json<PracticeSyncReply>({
      turns: stored ?? [],
      ended: saved.ended === true,
      answering: live ? { text: answering.text as string } : null,
    });
  }

  const sent = parsePracticeHistory(body?.history);
  if (!sent) return fail('Bad practice conversation', 400);
  let history = sent;
  if (stored) {
    if (action === 'feedback') history = stored;
    else {
      // The server's conversation only ever grows. The page adds its new line (the rep's words, the price
      // card) at the end of the conversation it has, which must be the server's whole conversation (its last
      // homeowner line the same); the page's homeowner lines are never used. The one exception: the rep's
      // last line again, firmed up (hands-free) or retried, which replaces it and its answer.
      if (saved.ended === true) return fail("That door's closed. Get your feedback.", 409);
      const tail = sent.findLastIndex((turn) => turn.role === 'customer') + 1;
      const added = sent.slice(tail);
      const lined = tail === 0 ? stored.length === 0 : stored[tail - 1]?.role === 'customer' && stored[tail - 1].text === sent[tail - 1].text;
      if (!lined || (tail !== stored.length && !sameLineAgain(stored, tail, added, parseSteps(saved.steps), body?.replacing))) {
        return NextResponse.json({ error: 'That practice is over. Knock again to start a new one.', turns: stored }, { status: 409 });
      }
      history = [...stored.slice(0, tail), ...added];
    }
  }
  const knock = action === 'turn' && history.length === 0;
  // Hands-free: the interruption for a rep who's still talking ('cutin', from what they've said so far),
  // and the turn that plays it (cut: the homeowner's line is the one written then, only the judge runs).
  const partial = action === 'cutin' && typeof body?.partial === 'string' ? body.partial.trim() : '';
  const pendingCut = parsePendingCut(saved.pendingCut);
  const cut = action === 'turn' && body?.cut === true && pendingCut?.at === history.length ? pendingCut : null;
  if (action === 'cutin') {
    if (!partial || partial.length > MAX_REP_CHARS) return fail('Bad cut-in', 400);
    if (history.at(-1)?.role !== 'customer' || history.length >= MAX_PRACTICE_TURNS - 1) return fail('Bad cut-in', 400);
  } else if (action === 'turn') {
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
  let recentNames: string[] = [];
  // The rep's state, for the providers at their doors: read at the knock, kept with the session.
  let region = typeof saved.region === 'string' ? saved.region : '';
  let door: PracticeDoor;
  if (knock) {
    // Only an owner picks; a rep's knock is always a surprise, and so is the kind of door. A landlord door
    // is a renter, drawn outside the shuffle bag (it isn't a turn of the bag).
    const choice = gate.isOwner && isPersonaChoice(body?.persona) ? body.persona : 'surprise';
    const previous = typeof saved.persona === 'string' ? saved.persona : null;
    sessionId = randomUUID();
    seed = randomInt(0, 2 ** 32 - 1);
    // A rep with an open assignment for one homeowner type gets that type (a normal or Ring door).
    const assigned = gate.isOwner ? null : await assignedFor(db, gate.uid);
    const drawnKind = choice === 'surprise' ? drawDoorKind(seed, previous) : 'standard';
    const doorKind = assigned ? (drawnKind === 'ring' ? 'ring' : 'standard') : drawnKind;
    if (assigned) {
      personaId = assigned;
      bag = Array.isArray(saved.bag) ? saved.bag.filter(isPersonaId) : [];
    } else if (doorKind === 'landlord') {
      personaId = 'renter';
      bag = Array.isArray(saved.bag) ? saved.bag.filter(isPersonaId) : [];
    } else {
      ({ persona: personaId, bag } = drawPersona(choice, saved.bag, previous, () => randomInt(0, 2 ** 31) / 2 ** 31));
    }
    // A full name this rep hasn't met in their last RECENT_NAMES doors: the seed is drawn again until one
    // is new (it fixes the name).
    const recent = Array.isArray(saved.recentNames) ? saved.recentNames.filter((name): name is string => typeof name === 'string') : [];
    seed = freshSeed(personaId, seed, recent, () => randomInt(0, 2 ** 32 - 1));
    recentNames = [practiceCustomer(personaId, seed).name, ...recent].slice(0, RECENT_NAMES);
    region = PRACTICE_REGION;
    const drawn = practiceCustomer(personaId, seed, region);
    // An owner's picked homeowner is a plain door (to demo that homeowner); the clock still counts.
    door = choice === 'surprise' ? drawDoor(seed, drawn, doorKind, new Date()) : { ...drawDoor(seed, drawn, 'standard', new Date()), surprise: null };
    patienceBefore = drawn.persona.patience;
  } else {
    if (!current) return over();
    ({ sessionId, personaId, seed } = current);
    door = saved.door ? parseDoor(saved.door) : STANDARD_DOOR;
    const start = practiceCustomer(personaId, seed).persona.patience;
    patienceBefore = Number.isInteger(saved.patience) ? Math.min(start, Math.max(0, saved.patience as number)) : start;
    // The same spot again (hands-free re-sending a line the transcript firmed up, Try again): it starts
    // from the patience the first try started from, so a line never counts twice.
    const again = action === 'turn' ? parseSteps(saved.steps).find((step) => step.at === history.length) : undefined;
    if (again) patienceBefore = Math.min(start, again.patience);
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
  const release = () => (action === 'feedback' ? updateIfCurrent(db, sessionRef, sessionId, { gradingAt: 0 }) : Promise.resolve(true));
  if (!config.apiKey && !stub) {
    await release();
    return fail('Practice is not set up yet. Call Jeremy or Jacob.', 503);
  }

  const now = new Date();
  // Model calls this request makes: the knock and the coach 1, a rep line 2 (homeowner and line judge). A knock
  // also needs room left for a practice worth having: two rep lines and the feedback.
  const calls = action === 'turn' && !knock && !cut ? 2 : 1;
  const headroom = knock ? KNOCK_HEADROOM : 0;
  if (!(await takeDailyPractice(db, gate.uid, now, calls, headroom))) {
    await release();
    if (knock || action === 'feedback') return fail("That's today's practice limit. Back at it tomorrow.", 429);
    // Mid-practice: the coach is told the limit stopped them, and End still gets the feedback.
    await updateIfCurrent(db, sessionRef, sessionId, { capped: true });
    return fail("That's today's practice limit. Tap End to get your feedback.", 429);
  }

  const customer = practiceCustomer(personaId, seed, region);
  // The rep's lines lose typed contacts before the model or the log; the homeowner's are the model's own.
  // A screen card is always this door's own card, whatever the page sent.
  const card = practiceScreenCard(customer.persona);
  const turns = cleanTurns(history, card);
  const started = Date.now();
  // A rep line being answered: a reload meanwhile shows it and waits for the answer (sync).
  const answered = action === 'turn' && !knock && turns.at(-1)?.role === 'rep';
  if (answered) await updateIfCurrent(db, sessionRef, sessionId, { answering: { text: turns.at(-1)!.text, since: Date.now() } });
  const unanswered = (error: unknown) => {
    if (answered) void updateIfCurrent(db, sessionRef, sessionId, { answering: null }).catch(() => {});
    return providerFailure(error, action, started);
  };

  if (action === 'cutin') {
    let reply: string;
    if (stub) reply = 'Sorry, hang on. What is this about?';
    else {
      const heard = [...turns, { role: 'rep' as const, text: redactContact(partial) }];
      const messages = homeownerMessages(customer, door, heard, patienceBefore, [CUT_IN_NOTE]);
      try {
        ({ answer: reply } = await callAskModel(config, messages, CUSTOMER_CALL));
      } catch (error) {
        return providerFailure(error, action, started);
      }
    }
    const { text } = readCustomerReply(reply, patienceBefore, null, seed, door.kind === 'kid');
    const lines = splitSpeakers(text, door, spouseHere(door, turns));
    // Kept until the turn that plays it (or any other turn, which drops it); the voice route may speak it now.
    if (!(await updateIfCurrent(db, sessionRef, sessionId, { pendingCut: { at: turns.length + 1, raw: reply, lines }, updatedAt: now }))) {
      return over();
    }
    log({ outcome: 'ok', action, stub, turns: turns.length, ms: Date.now() - started });
    return NextResponse.json<PracticeCutInReply>({ lines });
  }

  if (action === 'turn') {
    let reply: string;
    let event: PracticeEvent | null = null;
    let usage: AskUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
    const kid = door.kind === 'kid';
    // A price that isn't on the screen the homeowner saw: the homeowner hears about it, and it's a lie.
    const note = knock ? null : priceNote(turns, customer);
    // The spouse walking up or an interruption, on the rep line it's due.
    const surprise = knock ? null : surpriseNote(door, turns, customer);
    // The rep only pulled up the price screen: there are no words of theirs to judge, and an earlier lie
    // already counted when it was said.
    const screenOnly = !knock && turns.slice(turns.findLastIndex((turn) => turn.role === 'customer') + 1).every((turn) => turn.role === 'screen');
    // A rep who says they want to hurt themselves: no role-play, no judge. The homeowner is kind and it ends.
    const hurting = !knock && turns.slice(turns.findLastIndex((turn) => turn.role === 'customer') + 1).some((turn) => turn.role === 'rep' && isSelfHarm(turn.text));
    if (hurting) {
      reply = `${SELF_HARM_REPLY} [END]`;
      event = 'ok';
    } else if (stub) {
      reply = cut ? cut.raw : turns.length === 0 ? 'Hi, can I help you?' : 'Sandbox homeowner here. No model was called.';
      event = knock ? null : note ? 'lie' : 'ok';
    } else {
      // A cut-in plays the line written for it; only the judge runs.
      const messages = cut
        ? null
        : homeownerMessages(customer, door, turns, patienceBefore, knock ? [openerHint(customer, seed)] : [note, surprise]);
      // The judge runs beside the homeowner, so it costs no time. If it fails, the line counts as fair:
      // a network blip isn't the rep's fault.
      const judged = knock
        ? Promise.resolve(null)
        : screenOnly
          ? Promise.resolve('ok' as const)
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
        const [homeowner, verdict] = await Promise.all([
          messages ? callAskModel(config, messages, CUSTOMER_CALL) : Promise.resolve({ answer: cut!.raw, usage }),
          judged,
        ]);
        ({ answer: reply, usage } = homeowner);
        event = verdict && note && verdict !== 'abuse' && !screenOnly ? 'lie' : verdict;
      } catch (error) {
        return unanswered(error);
      }
    }
    const first = readCustomerReply(reply, patienceBefore, event, seed, kid);
    const { patience } = first;
    let { text, ended } = first;
    // Patience ran out on this line but the homeowner's reply didn't close the door: rather than a fixed
    // line after whatever they'd just said (even "that's way better"), they end it in their own words.
    if (!stub && !hurting && !knock && !cut && patience === 0 && event !== 'abuse' && (text === OUT_OF_PATIENCE || kid)) {
      const last = await callAskModel(
        config,
        homeownerMessages(customer, door, turns, 0, [note, surprise, LAST_STRAW_NOTE]),
        CUSTOMER_CALL
      ).catch(() => null);
      const closing = last ? readCustomerReply(last.answer, 1, null, seed, kid) : null;
      if (closing?.text) ({ text } = closing);
      ended = true;
    }
    let lines = splitSpeakers(text, door, spouseHere(door, turns));
    // The spouse speaks only their own worry, after the homeowner's own lead-in when they walk up; a reply
    // that gave them the homeowner's words is written once more, then put right in code.
    const joining = door.surprise?.kind === 'spouse' && surpriseNote(door, turns, customer) !== null;
    const spouseOff = !stub && !cut && !hurting && spouseLinesProblem(lines, door, customer, joining);
    if (spouseOff) {
      const again = await callAskModel(
        config,
        homeownerMessages(customer, door, turns, patienceBefore, [note, surprise, SPOUSE_FORMAT_NOTE]),
        CUSTOMER_CALL
      ).catch(() => null);
      const retried = again ? splitSpeakers(readCustomerReply(again.answer, patienceBefore, event, seed, kid).text, door, spouseHere(door, turns)) : null;
      lines = retried && !spouseLinesProblem(retried, door, customer, joining) ? retried : fixSpouseLines(lines, door, customer, joining);
      log({ outcome: 'spouse_line_retry', fixed: retried !== null && !spouseLinesProblem(retried, door, customer, joining) });
    }
    const beat = knock ? null : beatNow(door, turns);
    const outcome: PracticeTurnReply = {
      lines,
      ended,
      ...(ended ? { close: event === 'abuse' || patience === 0 ? ('slam' as const) : ('shut' as const) } : {}),
      ...(beat ? { beat } : {}),
      budgetMs: talkBudgetMs(customer.persona.patience, patience),
    };
    log({ outcome: 'ok', action, stub, cut: cut !== null, turns: turns.length, ended, patience, event: event ?? 'knock', door: door.kind, ms: Date.now() - started, ...usage });
    if (!knock) {
      // lastLines: the lines POST .../practice/voice will speak. The step (how this line landed) replaces
      // one from a retried request for the same line.
      const step: PracticeStep = { at: turns.length, event: event ?? 'ok', patience: patienceBefore };
      const steps = [...parseSteps(saved.steps).filter((kept) => kept.at < turns.length), step];
      const written = await updateIfCurrent(db, sessionRef, sessionId, {
        patience,
        lastLines: lines,
        steps,
        turns: [...turns, ...lines.map(asTurn)],
        ended,
        answering: null,
        pendingCut: null,
        ...(hurting ? { selfHarm: true } : {}),
        updatedAt: now,
      });
      if (!written) return over();
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
      steps: [],
      turns: lines.map(asTurn),
      ended,
      recentNames,
      region,
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
  const redoOf = typeof saved.redoOf === 'string' ? saved.redoOf : null;
  const steps = parseSteps(saved.steps);
  const hurting = saved.selfHarm === true || turns.some((turn) => turn.role === 'rep' && isSelfHarm(turn.text));
  if (hurting) {
    feedback = SELF_HARM_FEEDBACK;
  } else if (stub) {
    feedback = 'Score: 7/10\nResult: No sale\nSkills: Opener 7/10, Discovery 6/10, Objections 6/10, Close 5/10\nWhat worked:\n- "Sandbox: no model was called."\nFix next time: Nothing yet.\nTry this line: "Hi, I\'m with 3C."';
  } else {
    const [notes, corrections] = await Promise.all([loadNotes(db), loadCorrections(db)]);
    // A redo: the lines before the marker are the first try, replayed; the rep is graded on what follows.
    const redoFrom = redoOf && Number.isInteger(saved.redoFrom) ? Math.min(saved.redoFrom as number, turns.length) : 0;
    const transcript = redoFrom
      ? `${transcriptText(turns.slice(0, redoFrom))}\n--- The rep redoes the moment from here ---\n${transcriptText(turns.slice(redoFrom))}`
      : transcriptText(turns);
    const redoNote = redoFrom
      ? '\n\nThis is a redo: the rep went back to the line that went worst and tried it again. The lines above the marker are the earlier try, replayed as it happened. Grade what the rep says after the marker; quote only those lines. The Skills line still scores the whole door as it stands.'
      : '';
    const cappedNote =
      saved.capped === true
        ? "\n\nThe rep hit the day's practice limit mid-conversation and couldn't say any more: never dock them for stopping early or for what they didn't get to."
        : '';
    const messages: AskMessage[] = [
      {
        role: 'system',
        content: buildFeedbackPrompt(
          notes,
          customer,
          endedBy,
          { block: doorCoachBlock(door, customer, turns), ...resultRules(customer, door) },
          correctionsBlock(corrections),
          gate.name.trim().split(/\s+/)[0] ?? ''
        ),
      },
      { role: 'user', content: `Grade this practice.${redoNote}${cappedNote}\n\n${calendarNote(now)}\n\nTranscript:\n${transcript}` },
    ];
    try {
      // Low temperature where the provider honors it (DeepSeek ignores it while thinking, but not on the
      // no-thinking fallback); the score is held to the skills in code either way (enforceScore).
      ({ answer: feedback, usage } = await callAskModel(config, messages, { timeoutMs: COACH_TIMEOUT_MS, effort: 'low', temperature: 0.2 }));
      // The rep lines the judge caught lying: What worked never quotes them.
      const lieLines = steps.filter((step) => step.event === 'lie').map((step) => turns[step.at - 1]?.text ?? '');
      const stray = (answer: string) => [...unbackedClaims(answer, turns), ...strayCoachSentences(answer, turns)];
      // One retry when the shape is off (an extra section, a missing one, a price in the Try line), or when it
      // puts words in someone's mouth (a pain point the homeowner never said).
      const invented = stray(feedback);
      const formatProblem = feedbackProblem(feedback);
      const problem =
        formatProblem ??
        transcriptProblem(feedback, turns, lieLines) ??
        (invented.length
          ? `this sentence isn't backed by the transcript: "${invented[0]}". Only say the rep or the homeowner said what the transcript shows they said, never use a fact or amount nobody said at the door, and never write about the grading itself`
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
          { timeoutMs: Math.min(COACH_TIMEOUT_MS, left), effort: 'low', temperature: 0.2 }
        ).catch(() => null);
        // The retry is held to the same format: it only replaces a first answer whose format was fine if
        // its own is too (a retry for a made-up claim once slipped a price into the Try line).
        if (retry && (feedbackProblem(retry.answer) === null || formatProblem !== null)) feedback = retry.answer;
      }
      // Still putting words in someone's mouth, or quoting a lie as what worked: those go.
      const still = [...stray(feedback), ...lieQuotes(feedback, lieLines)];
      if (still.length) {
        log({ outcome: 'coach_claims_stripped', count: still.length });
        feedback = stripSentences(feedback, still, fallbackFix(feedback, steps.filter((step) => step.event === 'lie').length));
      }
      feedback = enforceResult(feedback, resultRules(customer, door));
      // The number is counted in code: the skills' average, capped by what the judge caught line by line.
      feedback = enforceScore(feedback, {
        lies: steps.filter((step) => step.event === 'lie').length,
        abuse: steps.some((step) => step.event === 'abuse'),
        pitchedNoSaleDoor: (door.kind === 'kid' || door.kind === 'landlord') && steps.some((step) => step.event === 'weak' || step.event === 'lie'),
        kidDoor: door.kind === 'kid',
      });
    } catch (error) {
      await release();
      return providerFailure(error, action, started);
    }
  }
  const summary = doorSummary(door, customer, turns);
  if (!hurting) feedback = revealFeedback(feedback, customer.persona, summary);
  const score = hurting ? null : parseScore(feedback);
  const skills = hurting ? null : parseSkills(feedback);
  const delivery = parseDelivery(body?.delivery);
  // Hands-free: how long each answer took to start after the rep stopped talking (the page measures it).
  const replyMs = Array.isArray(body?.replyMs)
    ? body.replyMs.filter((ms): ms is number => Number.isInteger(ms) && ms >= 0 && ms <= 60_000).slice(0, MAX_PRACTICE_TURNS)
    : [];
  const result = hurting ? 'Not graded' : (/^\s*result\s*:\s*(.+)$/im.exec(feedback)?.[1].trim() ?? null);
  const ref = await db.collection(PRACTICE_LOG).add({
    uid: gate.uid,
    repName: gate.name,
    persona: customer.persona.id,
    personaLabel: customer.persona.label,
    seed,
    homeowner: homeownerPicks(customer),
    region,
    door,
    doorSummary: summary,
    turns,
    endedBy,
    score,
    result,
    skills,
    steps,
    delivery,
    ...(replyMs.length ? { replyMs } : {}),
    ...(redoOf ? { redoOf, redoFrom: saved.redoFrom } : {}),
    feedback,
    model: stub ? STUB_MODEL : config.model,
    createdAt: now,
  });
  const reply: PracticeFeedbackReply = { id: ref.id, feedback, score, skills, canRedo: !hurting && redoPoint(steps) !== null };
  // Kept on the session only while it's still this one: another screen may have knocked meanwhile, and
  // that practice must never get this one's feedback. The log above is this session's either way.
  await updateIfCurrent(db, sessionRef, sessionId, { feedback: reply, gradingAt: 0, updatedAt: now });
  const medianReply = replyMs.length ? replyMs.toSorted((a, b) => a - b)[Math.floor(replyMs.length / 2)] : -1;
  log({ outcome: 'ok', action, stub, turns: turns.length, score: score ?? -1, ms: Date.now() - started, medianReplyMs: medianReply, ...usage });
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

/** The homeowner type an open assignment asks the rep's next knock to be; null leaves it to the bag. */
async function assignedFor(db: FirebaseFirestore.Firestore, uid: string): Promise<PersonaId | null> {
  const now = new Date();
  const today = chicagoDayKey(now);
  const assignments = (await loadAssignments(db)).filter(
    (assignment) => assignment.persona !== 'any' && assignment.due >= today && (assignment.repUid === null || assignment.repUid === uid)
  );
  if (!assignments.length) return null;
  const since = new Date(assignments.reduce((min, assignment) => (assignment.createdAt < min ? assignment.createdAt : min), now.toISOString()));
  const sessions = await loadCountedSessions(db, since, uid);
  return assignedPersona(openAssignmentsFor(uid, assignments, sessions, today));
}

/**
 * "Redo that moment": a new session at the same door (same homeowner, same
 * picks, same surprise), with the conversation up to the finished practice's
 * worst line and the homeowner's patience as it was then. It counts as a new
 * short practice: it needs a knock's headroom, and is logged on its own.
 */
async function startRedo(
  db: FirebaseFirestore.Firestore,
  uid: string,
  logId: unknown,
  saved: FirebaseFirestore.DocumentData,
  sessionRef: FirebaseFirestore.DocumentReference
) {
  if (typeof logId !== 'string' || !logId || logId.includes('/')) return fail('Bad practice to redo', 400);
  const logged = (await db.collection(PRACTICE_LOG).doc(logId).get()).data();
  if (!logged || logged.uid !== uid || !isPersonaId(logged.persona) || !isPracticeSeed(logged.seed)) {
    return fail('That practice is gone. Knock again to start a new one.', 404);
  }
  const point = redoPoint(parseSteps(logged.steps));
  const history = parsePracticeHistory(logged.turns);
  const kept = history?.slice(0, point?.keep ?? 0) ?? [];
  if (!point || kept.at(-1)?.role !== 'customer') return fail('Nothing in that one to redo. Knock again.', 409);
  const now = new Date();
  if (!(await takeDailyPractice(db, uid, now, 0, KNOCK_HEADROOM))) {
    return fail("That's today's practice limit. Back at it tomorrow.", 429);
  }
  const region = typeof logged.region === 'string' ? logged.region : '';
  const customer = practiceCustomer(logged.persona, logged.seed, region);
  const door = logged.door ? parseDoor(logged.door) : STANDARD_DOOR;
  // The homeowner's lines just before the moment: the ones Talk mode replays.
  let from = kept.length;
  while (from > 0 && kept[from - 1].role === 'customer') from -= 1;
  const lastLines = kept.slice(from).map((turn) => ({ speaker: turn.speaker ?? (door.kind === 'kid' ? 'kid' : 'homeowner'), text: turn.text }));
  const sessionId = randomUUID();
  await sessionRef.set({
    uid,
    sessionId,
    persona: logged.persona,
    seed: logged.seed,
    patience: Math.min(customer.persona.patience, point.patience),
    bag: Array.isArray(saved.bag) ? saved.bag.filter(isPersonaId) : [],
    lastLines,
    steps: [],
    turns: kept,
    homeowner: homeownerPicks(customer),
    region,
    // The rep's recent homeowners carry on, so names don't start repeating after a redo.
    recentNames: Array.isArray(saved.recentNames) ? saved.recentNames : [],
    door,
    redoOf: logId,
    redoFrom: kept.length,
    startedAt: now,
    updatedAt: now,
  });
  log({ outcome: 'ok', action: 'redo', turns: kept.length });
  return NextResponse.json<PracticeRedoReply>({
    sessionId,
    history: kept,
    ring: door.kind === 'ring',
    ambient: ambientFor(customer, door),
  });
}

/** When patience runs out on a line the homeowner answered without closing: they close it themselves. */
const LAST_STRAW_NOTE =
  "(You've had enough of this rep. This is your last line: end it now in your own words, firmly but without being rude, and close the door. Don't praise their offer in this line.)";

/** A spouse reply that mixed the two people up: how to write it. */
const SPOUSE_FORMAT_NOTE =
  '(Write each person on their own line. Your own words first, as the homeowner. Then your spouse on a line of their own starting "SPOUSE:", saying only their own worry, never your words or your situation. Anything you say after them goes on a line starting "HOMEOWNER:".)';

/** The hidden note that makes the homeowner cut in on a rep who won't stop talking. */
const CUT_IN_NOTE =
  "(The rep is still talking and hasn't let you get a word in. Cut in now, over them: one short line, in character, the way a real person at the door interrupts someone who rambles. Don't answer everything they said.)";

interface PendingCut {
  /** The conversation's length once the rep's cut-off line is in: the turn that plays it. */
  at: number;
  /** The homeowner model's line as written. */
  raw: string;
  lines: PracticeLine[];
}

function parsePendingCut(value: unknown): PendingCut | null {
  const cut = value as Partial<PendingCut> | null | undefined;
  return cut && Number.isInteger(cut.at) && typeof cut.raw === 'string' && Array.isArray(cut.lines)
    ? { at: cut.at as number, raw: cut.raw, lines: cut.lines }
    : null;
}

/**
 * The homeowner model's conversation: its prompt (the kid's at a kid door),
 * then the knock, the rep's lines and the screen they were shown, one user
 * message per stretch between the homeowner's own lines (the spouse's lines
 * tagged as the model wrote them), and hidden notes on the last one.
 */
function homeownerMessages(
  customer: PracticeCustomer,
  door: PracticeDoor,
  turns: PracticeTurn[],
  patience: number,
  notes: (string | null)[]
): AskMessage[] {
  const system =
    door.kind === 'kid' ? buildKidPrompt(customer, door) : buildCustomerPrompt(customer, patience, doorPromptBlock(door, customer, turns));
  const messages: AskMessage[] = [{ role: 'system', content: system }];
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
    const line = turn.role === 'screen' ? screenForHomeowner(turn.text, customer) : turn.text;
    heard = heard ? `${heard}\n${line}` : line;
  }
  if (said.length) {
    messages.push({ role: 'user', content: heard }, { role: 'assistant', content: asModelLine(said) });
    heard = '';
  }
  messages.push({ role: 'user', content: [heard, ...notes].filter(Boolean).join('\n') });
  return messages;
}
