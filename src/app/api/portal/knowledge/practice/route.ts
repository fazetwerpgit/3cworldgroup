import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { parsePracticeHistory, type PracticeLogView } from '@/lib/ask/practice';
import { CORRECTION_PARTS, parseDelivery, parseSkills, type CorrectionView } from '@/lib/ask/practiceCoaching';
import { PRACTICE_CORRECTIONS, PRACTICE_LOG, isoTime } from '@/lib/ask/store';

// GET /api/portal/knowledge/practice — the latest 100 finished Ask 3C
// Practice sessions (transcript, feedback, score, skill scores, delivery, the
// owner's corrections) for the owner's Practice tab. Owner only.

export const dynamic = 'force-dynamic';

const LIMIT = 100;

/**
 * "Maria Garcia, voice Kore · Spectrum $91 · kids yelling; cooking" from a
 * session's picks; null for sessions logged before picks were kept.
 */
function homeownerLabel(value: unknown): string | null {
  const picks = value as { name?: unknown; voice?: unknown; provider?: unknown; bill?: unknown; details?: unknown } | null | undefined;
  if (!picks || typeof picks.name !== 'string' || !picks.name) return null;
  const who = typeof picks.voice === 'string' && picks.voice ? `${picks.name}, voice ${picks.voice}` : picks.name;
  const provider = typeof picks.provider === 'string' ? picks.provider : '';
  const bill = typeof picks.bill === 'number' ? `$${picks.bill}/mo` : '';
  const details = Array.isArray(picks.details) ? picks.details.filter((d): d is string => typeof d === 'string').join('; ') : '';
  return [who, [provider, bill].filter(Boolean).join(' '), details].filter(Boolean).join(' · ');
}

/** The Result line of the coach's feedback, for sessions logged before it was kept on its own. */
function resultOf(feedback: unknown): string | null {
  return typeof feedback === 'string' ? (/^\s*result\s*:\s*(.+)$/im.exec(feedback)?.[1].trim() ?? null) : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const [snap, correctionSnap] = await Promise.all([
    adminDb.collection(PRACTICE_LOG).orderBy('createdAt', 'desc').limit(LIMIT).get(),
    adminDb.collection(PRACTICE_CORRECTIONS).orderBy('createdAt', 'desc').limit(500).get(),
  ]);
  const corrections = new Map<string, CorrectionView[]>();
  for (const doc of correctionSnap.docs) {
    const data = doc.data();
    const part = CORRECTION_PARTS.find((candidate) => candidate === data.part);
    if (!part || typeof data.logId !== 'string' || typeof data.take !== 'string') continue;
    const list = corrections.get(data.logId) ?? [];
    list.push({ id: doc.id, part, original: typeof data.original === 'string' ? data.original : '', take: data.take, createdAt: isoTime(data.createdAt) });
    corrections.set(data.logId, list);
  }
  const sessions: PracticeLogView[] = snap.docs.map((doc) => {
    const data = doc.data();
    const feedback = typeof data.feedback === 'string' ? data.feedback : '';
    return {
      id: doc.id,
      repName: typeof data.repName === 'string' ? data.repName : '',
      persona: typeof data.personaLabel === 'string' ? data.personaLabel : '',
      homeowner: homeownerLabel(data.homeowner),
      door: typeof data.doorSummary === 'string' && data.doorSummary ? data.doorSummary : null,
      result: typeof data.result === 'string' && data.result ? data.result : resultOf(data.feedback),
      score: typeof data.score === 'number' ? data.score : null,
      skills: parseSkills(feedback),
      delivery: parseDelivery(data.delivery),
      redo: typeof data.redoOf === 'string',
      feedback,
      turns: parsePracticeHistory(data.turns) ?? [],
      corrections: (corrections.get(doc.id) ?? []).toReversed(),
      createdAt: isoTime(data.createdAt),
    };
  });
  return NextResponse.json({ sessions });
}
