import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { practiceAudience } from '@/lib/ask/flag';
import {
  LISTEN_OPEN_MS,
  LISTEN_SESSION_MS,
  LISTEN_SETUP,
  LISTEN_URL,
  type PracticeListenReply,
} from '@/lib/ask/practiceHandsFree';
import { takeDailyPracticeListen } from '@/lib/ask/store';

// POST /api/portal/ask/practice/listen — hands-free practice: a short-lived
// Gemini token the phone uses to stream its mic straight to live
// transcription. The API key stays here; the token opens one session within a
// minute, and its setup (model, text only, US English, our vocabulary) is
// locked here, so the browser can't use it for anything else. Same gate as the
// practice route; its own daily count.

export const runtime = 'nodejs';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const audience = practiceAudience();
  if (audience === 'off') return fail('Ask 3C is not turned on yet.', 404);
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (audience === 'owners' && !gate.isOwner) return fail('Ask 3C is not turned on yet.', 404);
  if (!adminDb) return fail('Database not configured', 500);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail('Hands-free is not set up.', 503);
  const now = new Date();
  if (!(await takeDailyPracticeListen(adminDb, gate.uid, now))) return fail("That's today's hands-free limit. Tap to talk still works.", 429);

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        newSessionExpireTime: new Date(now.getTime() + LISTEN_OPEN_MS).toISOString(),
        expireTime: new Date(now.getTime() + LISTEN_SESSION_MS).toISOString(),
        bidiGenerateContentSetup: LISTEN_SETUP,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => ({}))) as { name?: unknown };
    if (!res.ok || typeof json.name !== 'string') {
      console.info('[ask-3c-practice-listen]', JSON.stringify({ outcome: 'mint_failed', status: res.status }));
      return fail("Hands-free didn't start. Tap to talk still works.", 502);
    }
    return NextResponse.json<PracticeListenReply>({ token: json.name, url: LISTEN_URL });
  } catch {
    return fail("Hands-free didn't start. Tap to talk still works.", 502);
  }
}
