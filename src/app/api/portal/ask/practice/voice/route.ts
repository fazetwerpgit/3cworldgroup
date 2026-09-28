import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { askAudience } from '@/lib/ask/flag';
import { isPersonaId, isPracticeSeed, practiceCustomer } from '@/lib/ask/practice';
import { speakLine } from '@/lib/ask/practiceTts';
import { spokenText } from '@/lib/ask/practiceVoice';
import { PRACTICE_SESSIONS, takeDailyPracticeVoice } from '@/lib/ask/store';

// POST /api/portal/ask/practice/voice { sessionId, text } — the homeowner's
// latest line spoken in the session's Gemini voice, as audio/wav. Only that
// line of the caller's own current practice: never arbitrary text, so this is
// not a free TTS service. Same gate as the practice route; its own daily
// count. Any failure is an error status and the page reads the line with the
// phone's own voice instead.

export const runtime = 'nodejs';
export const maxDuration = 20;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function log(event: Record<string, string | number | boolean>) {
  console.info('[ask-3c-practice-voice]', JSON.stringify(event));
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
  const sessionId = body?.sessionId;
  const text = body?.text;
  if (typeof sessionId !== 'string' || typeof text !== 'string') return fail('Send the session and the line', 400);

  const saved = (await db.collection(PRACTICE_SESSIONS).doc(gate.uid).get()).data() ?? {};
  if (saved.sessionId !== sessionId || !isPersonaId(saved.persona) || !isPracticeSeed(saved.seed)) {
    return fail('That practice is over.', 409);
  }
  if (typeof saved.lastLine !== 'string' || saved.lastLine !== text) return fail('Only the homeowner’s latest line', 403);
  const spoken = spokenText(text);
  if (!spoken) return fail('Nothing to say', 400);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail('The voice is not set up.', 503);

  if (!(await takeDailyPracticeVoice(db, gate.uid, new Date()))) return fail('That’s the voice limit for today.', 429);

  const customer = practiceCustomer(saved.persona, saved.seed);
  const patience = typeof saved.patience === 'number' ? saved.patience : customer.persona.patience;
  // A homeowner near the end of their rope sounds it.
  const style = patience <= 1 ? `${customer.style}, and clearly losing patience now` : customer.style;
  const started = Date.now();
  const result = await speakLine({ apiKey, voiceName: customer.ttsVoice, style, text: spoken });
  if (!result.ok) {
    log({ outcome: result.reason, ms: Date.now() - started });
    return fail('The voice didn’t come through.', result.reason === 'timeout' ? 504 : 502);
  }
  log({ outcome: 'ok', voice: customer.ttsVoice, chars: spoken.length, ms: Date.now() - started });
  return new NextResponse(new Uint8Array(result.wav), {
    status: 200,
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
  });
}
