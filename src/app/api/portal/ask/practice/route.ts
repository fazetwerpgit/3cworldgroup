import { randomInt, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { askAudience } from '@/lib/ask/flag';
import {
  KNOCK,
  MAX_PRACTICE_TURNS,
  buildCustomerPrompt,
  buildFeedbackPrompt,
  drawPersona,
  enforceResult,
  isPersonaChoice,
  isPersonaId,
  isPracticeSeed,
  parsePracticeHistory,
  parseScore,
  practiceCustomer,
  practiceScreenCard,
  readCustomerReply,
  revealFeedback,
  transcriptText,
  type PersonaId,
  type PracticeEndedBy,
  type PracticeFeedbackReply,
  type PracticeKnockReply,
  type PracticeTurn,
  type PracticeTurnReply,
} from '@/lib/ask/practice';
import { AskProviderError, askProviderConfig, callAskModel, type AskMessage, type AskUsage } from '@/lib/ask/provider';
import { redactContact } from '@/lib/ask/redact';
import { PRACTICE_DAILY_LIMIT, PRACTICE_LOG, PRACTICE_SESSIONS, loadNotes, takeDailyPractice } from '@/lib/ask/store';

// POST /api/portal/ask/practice
//   { action: 'turn', history: [], persona? }          the knock: the server picks who is
//                                                      behind the door and starts the session
//   { action: 'turn', sessionId, history }             the homeowner's next line
//   { action: 'feedback', sessionId, history, endedBy: 'homeowner'|'rep' }
//                                                      the coach's grade; logs the session
// Ask 3C Practice: the rep pitches, the model plays a homeowner, then grades
// the pitch against the owner's notes. Reps never choose or see the persona:
// the knock draws it from the rep's shuffle bag (all nine before any repeat)
// and keeps it server side in practiceSessions/{uid} with its seed, the
// homeowner's patience and the bag; the page only holds the session id. Owners may pick a persona
// (persona, default 'surprise') to demo one. Same gate as Ask 3C, its own daily
// count and its own log (practiceLog). Typed emails and phone numbers are
// redacted before the model or the log sees them.

export const runtime = 'nodejs';
export const maxDuration = 45;

const STUB_MODEL = 'sandbox-stub';
const TRY_AGAIN = 'Try again in a minute.';
/** Homeowner lines: quick, and different each time. */
const CUSTOMER_CALL = { think: false, temperature: 0.8, maxTokens: 400 } as const;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function log(event: Record<string, string | number | boolean>) {
  console.info('[ask-3c-practice]', JSON.stringify(event));
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
  if (action !== 'turn' && action !== 'feedback') return fail('Unknown practice action', 400);
  const history = parsePracticeHistory(body?.history);
  if (!history) return fail('Bad practice conversation', 400);
  const knock = action === 'turn' && history.length === 0;
  if (action === 'turn') {
    // The homeowner answers the knock (no lines yet) or the rep's last line, and never runs past the cap.
    if (history.length >= MAX_PRACTICE_TURNS) return fail("That's as long as a practice runs. Get your feedback.", 400);
    if (!knock && history.at(-1)?.role !== 'rep') return fail('Say something first', 400);
  } else if (!history.some((turn) => turn.role === 'rep')) {
    return fail('Say something to the homeowner first', 400);
  }
  const endedBy: PracticeEndedBy = body?.endedBy === 'homeowner' ? 'homeowner' : 'rep';
  if (action === 'feedback' && body?.endedBy !== endedBy) return fail('Bad practice ending', 400);

  // Who is behind the door: drawn on the knock, read back from the rep's session after that.
  const sessionRef = db.collection(PRACTICE_SESSIONS).doc(gate.uid);
  const saved = (await sessionRef.get()).data() ?? {};
  let sessionId: string;
  let personaId: PersonaId;
  let seed: number;
  let patienceBefore: number;
  let bag: PersonaId[] = [];
  if (knock) {
    // Only an owner picks; a rep's knock is always a surprise.
    const choice = gate.isOwner && isPersonaChoice(body?.persona) ? body.persona : 'surprise';
    const previous = typeof saved.persona === 'string' ? saved.persona : null;
    sessionId = randomUUID();
    ({ persona: personaId, bag } = drawPersona(choice, saved.bag, previous, () => randomInt(0, 2 ** 31) / 2 ** 31));
    seed = randomInt(0, 2 ** 32 - 1);
    patienceBefore = practiceCustomer(personaId, seed).persona.patience;
  } else {
    if (
      typeof body?.sessionId !== 'string' ||
      saved.sessionId !== body.sessionId ||
      !isPersonaId(saved.persona) ||
      !isPracticeSeed(saved.seed)
    ) {
      return fail('That practice is over. Knock again to start a new one.', 409);
    }
    sessionId = body.sessionId;
    personaId = saved.persona;
    seed = saved.seed;
    const start = practiceCustomer(personaId, seed).persona.patience;
    patienceBefore = Number.isInteger(saved.patience) ? Math.min(start, Math.max(0, saved.patience as number)) : start;
  }

  const config = askProviderConfig();
  const stub = !config.apiKey && process.env.E2E_SANDBOX === '1';
  if (!config.apiKey && !stub) return fail('Practice is not set up yet. Call Jeremy or Jacob.', 503);

  const now = new Date();
  if (!(await takeDailyPractice(db, gate.uid, now))) {
    return fail(`That's ${PRACTICE_DAILY_LIMIT} practice replies today, the daily limit. Back at it tomorrow.`, 429);
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
    let usage: AskUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
    if (stub) {
      reply = turns.length === 0 ? 'Hi, can I help you?' : 'Sandbox homeowner here. No model was called.';
    } else {
      const messages: AskMessage[] = [{ role: 'system', content: buildCustomerPrompt(customer, patienceBefore) }];
      // The homeowner's side: the knock, the rep's lines and the screen they were shown, one user message
      // per stretch between the homeowner's own lines.
      let heard = KNOCK;
      for (const turn of turns) {
        if (turn.role === 'customer') {
          messages.push({ role: 'user', content: heard }, { role: 'assistant', content: turn.text });
          heard = '';
          continue;
        }
        const line = turn.role === 'screen' ? `(The rep shows you their phone. ${turn.text})` : turn.text;
        heard = heard ? `${heard}\n${line}` : line;
      }
      messages.push({ role: 'user', content: heard });
      try {
        ({ answer: reply, usage } = await callAskModel(config, messages, CUSTOMER_CALL));
      } catch (error) {
        return providerFailure(error, action, started);
      }
    }
    const { text, ended, patience } = readCustomerReply(reply, patienceBefore);
    log({ outcome: 'ok', action, stub, turns: turns.length, ended, patience, ms: Date.now() - started, ...usage });
    if (!knock) {
      await sessionRef.update({ patience, updatedAt: now });
      return NextResponse.json<PracticeTurnReply>({ reply: text, ended });
    }
    // The session exists once the door has opened; a knock that got no answer leaves the last one as it was.
    await sessionRef.set({ uid: gate.uid, sessionId, persona: personaId, seed, patience, bag, startedAt: now, updatedAt: now });
    return NextResponse.json<PracticeKnockReply>({
      reply: text,
      ended,
      sessionId,
      voice: { gender: customer.gender, pitch: customer.voice.pitch, rate: customer.voice.rate, variant: seed },
      card,
    });
  }

  let feedback: string;
  let usage: AskUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
  if (stub) {
    feedback = 'Score: 7/10\nResult: sandbox, no model was called.\nWhat worked:\n- You showed up.\nFix next time: Nothing yet.\nTry this line: "Hi, I\'m with 3C."';
  } else {
    const notes = await loadNotes(db);
    const messages: AskMessage[] = [
      { role: 'system', content: buildFeedbackPrompt(notes, customer, endedBy) },
      { role: 'user', content: `Grade this practice.\n\nTranscript:\n${transcriptText(turns)}` },
    ];
    try {
      ({ answer: feedback, usage } = await callAskModel(config, messages));
      feedback = enforceResult(feedback, customer.persona.shouldBuy);
    } catch (error) {
      return providerFailure(error, action, started);
    }
  }
  feedback = revealFeedback(feedback, customer.persona);
  const score = parseScore(feedback);
  const ref = await db.collection(PRACTICE_LOG).add({
    uid: gate.uid,
    repName: gate.name,
    persona: customer.persona.id,
    personaLabel: customer.persona.label,
    seed,
    turns,
    endedBy,
    score,
    feedback,
    model: stub ? STUB_MODEL : config.model,
    createdAt: now,
  });
  log({ outcome: 'ok', action, stub, turns: turns.length, score: score ?? -1, ms: Date.now() - started, ...usage });
  return NextResponse.json<PracticeFeedbackReply>({ id: ref.id, feedback, score });
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
