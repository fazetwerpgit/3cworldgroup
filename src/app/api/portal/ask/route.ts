import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { isAllowedImageMime } from '@/lib/chat/media';
import { MAX_FORM_FILE_BYTES, resolveUploadMime } from '@/lib/forms/formUploads';
import { MAX_QUESTION_CHARS, parseHistory, type AskReply, type AskTurnMessage } from '@/lib/ask/chat';
import { askAudience } from '@/lib/ask/flag';
import { buildSystemPrompt } from '@/lib/ask/prompt';
import { AskProviderError, askProviderConfig, callAskModel, type AskContentPart, type AskMessage } from '@/lib/ask/provider';
import { redactContact } from '@/lib/ask/redact';
import { ASK_DAILY_LIMIT, ASK_LOG, loadNotes, ownDealerCodes, repHome, takeDailyAsk } from '@/lib/ask/store';

// POST /api/portal/ask (multipart: question, history JSON, optional photo) —
// Ask 3C: answers a rep's question from the owner's knowledge notes only.
// Typed emails and phone numbers are redacted before the model or the log sees
// them; the photo goes to the model as it is and is never stored. Logs carry
// outcome, status and timings only, never the question or the answer.

export const runtime = 'nodejs';
// The model call is capped at 30 s; this leaves room for the Firestore reads.
export const maxDuration = 45;

const STUB_MODEL = 'sandbox-stub';
const PHOTO_ONLY_QUESTION = 'Here is a photo. What should I do?';
const CALL_FOR_HELP = 'Try again, or call Jeremy or Jacob.';
const PREV_QUESTION_CHARS = 200;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function log(event: Record<string, string | number | boolean>) {
  console.info('[ask-3c]', JSON.stringify(event));
}

export async function POST(request: NextRequest) {
  // Kill switch: off unless 'true' (everyone) or 'owners' (the owner only).
  const audience = askAudience();
  if (audience === 'off') return fail('Ask 3C is not turned on yet.', 404);

  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (audience === 'owners' && !gate.isOwner) return fail('Ask 3C is not turned on yet.', 404);
  if (!adminDb) return fail('Database not configured', 500);
  const db = adminDb;

  const form = await request.formData().catch(() => null);
  if (!form) return fail('Send the question as a form', 400);

  const typed = form.get('question');
  const question = typeof typed === 'string' ? typed.trim() : '';
  if (question.length > MAX_QUESTION_CHARS) return fail(`Keep the question under ${MAX_QUESTION_CHARS} characters.`, 400);

  const photo = form.get('photo');
  let image: { mime: string; bytes: Buffer } | null = null;
  if (photo instanceof File && photo.size > 0) {
    const mime = resolveUploadMime(photo.type, photo.name);
    if (!isAllowedImageMime(mime)) return fail('Use a JPEG, PNG or WebP photo.', 400);
    if (photo.size > MAX_FORM_FILE_BYTES) {
      return fail(`The photo must be ${MAX_FORM_FILE_BYTES / (1024 * 1024)} MB or smaller.`, 400);
    }
    image = { mime, bytes: Buffer.from(await photo.arrayBuffer()) };
  }
  if (!question && !image) return fail('Type a question or add a photo.', 400);

  let history: AskTurnMessage[] = [];
  const rawHistory = form.get('history');
  if (typeof rawHistory === 'string' && rawHistory) {
    try {
      history = parseHistory(JSON.parse(rawHistory));
    } catch {
      return fail('Bad conversation history', 400);
    }
  }

  const config = askProviderConfig();
  // The E2E sandbox answers without a key so the page can be tested; it never calls out.
  const stub = !config.apiKey && process.env.E2E_SANDBOX === '1';
  if (!config.apiKey && !stub) return fail('Ask 3C is not set up yet. Call Jeremy or Jacob.', 503);

  const now = new Date();
  if (!(await takeDailyAsk(db, gate.uid, now))) {
    return fail(`You've asked ${ASK_DAILY_LIMIT} questions today, the daily limit. Call Jeremy or Jacob.`, 429);
  }

  const [notes, dealerCodes, home] = await Promise.all([
    loadNotes(db),
    ownDealerCodes(db, gate.uid),
    repHome(db, gate.uid).catch(() => ''),
  ]);
  const firstName = gate.name.includes('@') || gate.name === gate.uid ? '' : gate.name.split(/\s+/)[0];
  const redacted = redactContact(question);
  // A follow-up's log row shows what it followed, so the owner can read it in context.
  const previous = history.findLast((turn) => turn.role === 'user');
  const prevQuestion = previous ? redactContact(previous.text).slice(0, PREV_QUESTION_CHARS) : null;

  let answer: string;
  let usage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
  const started = Date.now();
  if (stub) {
    const titles = notes.map((note) => note.title);
    answer = `Test answer from the sandbox. No model was called.\nNotes loaded (${titles.length}): ${titles.join(', ') || 'none'}.`;
  } else {
    const content: AskContentPart[] = [{ type: 'text', text: redacted || PHOTO_ONLY_QUESTION }];
    if (image) {
      content.push({ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.bytes.toString('base64')}` } });
    }
    const messages: AskMessage[] = [
      { role: 'system', content: buildSystemPrompt(notes, { firstName, dealerCodes, now, home }) },
      ...history.map((turn) => ({
        role: turn.role,
        content: turn.role === 'user' ? redactContact(turn.text) : turn.text,
      })),
      { role: 'user', content },
    ];
    try {
      ({ answer, usage } = await callAskModel(config, messages));
    } catch (error) {
      const kind = error instanceof AskProviderError ? error.kind : 'unknown';
      const status = error instanceof AskProviderError ? error.status ?? 0 : 0;
      log({ outcome: 'provider_error', kind, status, ms: Date.now() - started });
      return fail(
        kind === 'timeout' ? `Ask 3C took too long to answer. ${CALL_FOR_HELP}` : `Ask 3C couldn't answer right now. ${CALL_FOR_HELP}`,
        kind === 'timeout' ? 504 : 502
      );
    }
  }

  const ref = await db.collection(ASK_LOG).add({
    uid: gate.uid,
    repName: gate.name,
    question: redacted,
    prevQuestion,
    hadPhoto: image !== null,
    answer,
    model: stub ? STUB_MODEL : config.model,
    promptTokens: usage.promptTokens,
    cachedTokens: usage.cachedTokens,
    completionTokens: usage.completionTokens,
    createdAt: now,
    rating: null,
  });
  log({ outcome: 'ok', stub, photo: image !== null, turns: history.length, ms: Date.now() - started, ...usage });
  return NextResponse.json<AskReply>({ id: ref.id, answer });
}
