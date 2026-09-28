import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { parsePracticeHistory, type PracticeLogView } from '@/lib/ask/practice';
import { PRACTICE_LOG, isoTime } from '@/lib/ask/store';

// GET /api/portal/knowledge/practice — the latest 100 finished Ask 3C
// Practice sessions (transcript, feedback, score) for the owner's Practice
// tab. Owner only.

export const dynamic = 'force-dynamic';

const LIMIT = 100;

/** "Maria Garcia, voice Kore" from a session's picks; null for sessions logged before picks were kept. */
function homeownerLabel(value: unknown): string | null {
  const picks = value as { name?: unknown; voice?: unknown } | null | undefined;
  if (!picks || typeof picks.name !== 'string' || !picks.name) return null;
  return typeof picks.voice === 'string' && picks.voice ? `${picks.name}, voice ${picks.voice}` : picks.name;
}

/** The Result line of the coach's feedback, for sessions logged before it was kept on its own. */
function resultOf(feedback: unknown): string | null {
  return typeof feedback === 'string' ? (/^\s*result\s*:\s*(.+)$/im.exec(feedback)?.[1].trim() ?? null) : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const snap = await adminDb.collection(PRACTICE_LOG).orderBy('createdAt', 'desc').limit(LIMIT).get();
  const sessions: PracticeLogView[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      repName: typeof data.repName === 'string' ? data.repName : '',
      persona: typeof data.personaLabel === 'string' ? data.personaLabel : '',
      homeowner: homeownerLabel(data.homeowner),
      result: typeof data.result === 'string' && data.result ? data.result : resultOf(data.feedback),
      score: typeof data.score === 'number' ? data.score : null,
      feedback: typeof data.feedback === 'string' ? data.feedback : '',
      turns: parsePracticeHistory(data.turns) ?? [],
      createdAt: isoTime(data.createdAt),
    };
  });
  return NextResponse.json({ sessions });
}
