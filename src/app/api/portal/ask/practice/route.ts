import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { askAudience } from '@/lib/ask/flag';
import {
  KNOCK,
  MAX_PRACTICE_TURNS,
  buildCustomerPrompt,
  buildFeedbackPrompt,
  enforceResult,
  isPersonaChoice,
  isPracticeSeed,
  parsePracticeHistory,
  parseScore,
  practiceCustomer,
  splitEnd,
  transcriptText,
  type PracticeEndedBy,
  type PracticeFeedbackReply,
  type PracticeTurn,
  type PracticeTurnReply,
} from '@/lib/ask/practice';
import { AskProviderError, askProviderConfig, callAskModel, type AskMessage, type AskUsage } from '@/lib/ask/provider';
import { redactContact } from '@/lib/ask/redact';
import { PRACTICE_DAILY_LIMIT, PRACTICE_LOG, loadNotes, takeDailyPractice } from '@/lib/ask/store';

// POST /api/portal/ask/practice
//   { action: 'turn', persona, seed, history }      the homeowner's next line
//   { action: 'feedback', persona, seed, history, endedBy: 'homeowner'|'rep' }
//                                                   the coach's grade; logs the session
// Ask 3C Practice: the rep pitches, the model plays a homeowner (persona +
// seed, so every call plays the same one), then grades the pitch against the
// owner's notes. Same gate as Ask 3C, its own daily count and its own log
// (practiceLog). Typed emails and phone numbers are redacted before the model
// or the log sees them.

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
  const persona = body?.persona;
  const seed = body?.seed;
  if (!isPersonaChoice(persona) || !isPracticeSeed(seed)) return fail('Pick who to practice on', 400);
  const history = parsePracticeHistory(body?.history);
  if (!history) return fail('Bad practice conversation', 400);
  if (action === 'turn') {
    // The homeowner answers the knock (no lines yet) or the rep's last line, and never runs past the cap.
    if (history.length >= MAX_PRACTICE_TURNS) return fail("That's as long as a practice runs. Get your feedback.", 400);
    if (history.length > 0 && history.at(-1)?.role !== 'rep') return fail('Say something first', 400);
  } else if (!history.some((turn) => turn.role === 'rep')) {
    return fail('Say something to the homeowner first', 400);
  }
  const endedBy: PracticeEndedBy = body?.endedBy === 'homeowner' ? 'homeowner' : 'rep';
  if (action === 'feedback' && body?.endedBy !== endedBy) return fail('Bad practice ending', 400);

  const config = askProviderConfig();
  const stub = !config.apiKey && process.env.E2E_SANDBOX === '1';
  if (!config.apiKey && !stub) return fail('Practice is not set up yet. Call Jeremy or Jacob.', 503);

  const now = new Date();
  if (!(await takeDailyPractice(db, gate.uid, now))) {
    return fail(`That's ${PRACTICE_DAILY_LIMIT} practice replies today, the daily limit. Back at it tomorrow.`, 429);
  }

  const customer = practiceCustomer(persona, seed);
  // The rep's lines lose typed contacts before the model or the log; the homeowner's are the model's own.
  const turns: PracticeTurn[] = history.map((turn) =>
    turn.role === 'rep' ? { role: 'rep', text: redactContact(turn.text) } : turn
  );
  const started = Date.now();

  if (action === 'turn') {
    let reply: string;
    let usage: AskUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
    if (stub) {
      reply = turns.length === 0 ? '(opens the door) Hi, can I help you?' : 'Sandbox homeowner here. No model was called.';
    } else {
      const messages: AskMessage[] = [
        { role: 'system', content: buildCustomerPrompt(customer) },
        { role: 'user', content: KNOCK },
        ...turns.map((turn) => ({ role: turn.role === 'rep' ? ('user' as const) : ('assistant' as const), content: turn.text })),
      ];
      try {
        ({ answer: reply, usage } = await callAskModel(config, messages, CUSTOMER_CALL));
      } catch (error) {
        return providerFailure(error, action, started);
      }
    }
    const { text, ended } = splitEnd(reply);
    log({ outcome: 'ok', action, stub, turns: turns.length, ended, ms: Date.now() - started, ...usage });
    return NextResponse.json<PracticeTurnReply>({ reply: text, ended });
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
  const score = parseScore(feedback);
  const ref = await db.collection(PRACTICE_LOG).add({
    uid: gate.uid,
    repName: gate.name,
    persona: customer.persona.id,
    personaLabel: customer.persona.label,
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
