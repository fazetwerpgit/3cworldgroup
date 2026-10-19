import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { chicagoDayBounds } from '@/lib/leaderboard/periods';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// GET /api/portal/admin/chat-reports/count — the chat-report figures behind the
// admin nav badge, without reading the reports: open count and how many came in
// since Chicago midnight, the office's business day (count() aggregations),
// plus when the oldest open one
// was filed. Uses the same chatReports (status, createdAt) index as the open
// queue.

function iso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  try {
    const open = adminDb.collection('chatReports').where('status', '==', 'open');
    const since = Timestamp.fromDate(chicagoDayBounds(chicagoDayKey(new Date())).start);
    const [total, recent, oldest] = await Promise.all([
      open.count().get(),
      open.where('createdAt', '>=', since).count().get(),
      open.orderBy('createdAt', 'asc').limit(1).get(),
    ]);
    return NextResponse.json({
      open: total.data().count,
      newToday: recent.data().count,
      oldestCreatedAt: oldest.docs.length ? iso(oldest.docs[0].data().createdAt) : null,
    });
  } catch (error) {
    console.error('[chat reports] count failed', error);
    return NextResponse.json({ error: 'Failed to count chat reports' }, { status: 500 });
  }
}
