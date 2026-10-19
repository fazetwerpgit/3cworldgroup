import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { chicagoDayBounds } from '@/lib/leaderboard/periods';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// GET /api/portal/admin/queue-counts: the figures behind the admin nav badges
// in one call, without reading a single submission. Each Requests queue is a
// count() aggregation on status == 'new' (the same definition as the owner's
// Needs attention count; equality only, so no composite index), and the chat
// reports keep their open count, new-today count (since Chicago midnight, the
// office's business day) and oldest open report (the
// chatReports (status, createdAt) index). A figure that fails comes back null
// so one bad queue does not blank the others.

/** Request form (as in /api/portal/forms/<form>) to its Firestore collection. */
const REQUEST_QUEUE_COLLECTIONS = {
  'payroll-dispute': 'payrollDisputes',
  'expedite-order': 'expediteOrders',
  'leads-request': 'leadsRequests',
  'fiber-report': 'fiberReports',
  'manager-interview': 'managerInterviews',
  'bug-report': 'bugReports',
} as const;

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
  const db = adminDb;

  const requestEntries = Object.entries(REQUEST_QUEUE_COLLECTIONS);
  const requestCounts = Promise.allSettled(
    requestEntries.map(([, collection]) => db.collection(collection).where('status', '==', 'new').count().get())
  );

  const chatReports = (async () => {
    const open = db.collection('chatReports').where('status', '==', 'open');
    const since = Timestamp.fromDate(chicagoDayBounds(chicagoDayKey(new Date())).start);
    const [total, recent, oldest] = await Promise.all([
      open.count().get(),
      open.where('createdAt', '>=', since).count().get(),
      open.orderBy('createdAt', 'asc').limit(1).get(),
    ]);
    return {
      open: total.data().count,
      newToday: recent.data().count,
      oldestCreatedAt: oldest.docs.length ? iso(oldest.docs[0].data().createdAt) : null,
    };
  })().catch((error) => {
    console.error('[queue counts] chat reports failed', error);
    return null;
  });

  const [settled, reports] = await Promise.all([requestCounts, chatReports]);
  const requests: Record<string, number | null> = {};
  settled.forEach((result, index) => {
    const [form] = requestEntries[index];
    if (result.status === 'fulfilled') {
      requests[form] = result.value.data().count;
    } else {
      console.error(`[queue counts] ${form} failed`, result.reason);
      requests[form] = null;
    }
  });

  return NextResponse.json({ requests, chatReports: reports }, { headers: { 'Cache-Control': 'no-store' } });
}
