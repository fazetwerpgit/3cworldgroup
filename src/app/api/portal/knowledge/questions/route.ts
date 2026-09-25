import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import type { AskLogView } from '@/lib/ask/chat';
import { ASK_LOG, isoTime } from '@/lib/ask/store';

// GET /api/portal/knowledge/questions[?rating=down] — the latest 100 Ask 3C
// exchanges for the owner's Questions tab, or the latest 100 thumbs-down ones.
// Owner only.

export const dynamic = 'force-dynamic';

const LIMIT = 100;
/**
 * Thumbs-down rows are read by the rating alone (a single-field index, no
 * composite to deploy) and sorted here; this many is far more than will ever
 * be waiting.
 */
const DOWN_SCAN = 1000;

export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const downOnly = request.nextUrl.searchParams.get('rating') === 'down';
  const log = adminDb.collection(ASK_LOG);
  const snap = downOnly
    ? await log.where('rating', '==', 'down').limit(DOWN_SCAN).get()
    : await log.orderBy('createdAt', 'desc').limit(LIMIT).get();

  const questions: AskLogView[] = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        repName: typeof data.repName === 'string' ? data.repName : '',
        question: typeof data.question === 'string' ? data.question : '',
        prevQuestion: typeof data.prevQuestion === 'string' && data.prevQuestion ? data.prevQuestion : null,
        hadPhoto: data.hadPhoto === true,
        answer: typeof data.answer === 'string' ? data.answer : '',
        rating: data.rating === 'up' || data.rating === 'down' ? data.rating : null,
        createdAt: isoTime(data.createdAt),
      };
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, LIMIT);
  return NextResponse.json({ questions });
}
