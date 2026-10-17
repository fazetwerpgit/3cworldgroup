import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { chatReportId, isSafeDocId } from '@/lib/chat/moderationShared';

// The chat moderation queue (App Store guideline 1.2). Reports are written by
// POST /api/portal/chat/messages/report as chatReports/{messageId}_{reporterUid}
// through the Admin SDK only; the Firestore rules deny every client read, so
// this route is the one way back-office staff see them.
//
// GET  ?status=open (default) | resolved  -> newest first, at most 100.
// PATCH { id, action: 'removed' | 'dismissed' } -> resolves the report and
//   every other open report on the same message, stamped with who and when.
//   Removing the message itself is the existing DELETE /api/portal/chat/messages;
//   the queue calls that first, then records the outcome here.

const LIST_LIMIT = 100;
const ACTIONS = ['removed', 'dismissed'] as const;
type ReportAction = (typeof ACTIONS)[number];

// chatReportId(messageId, reporterUid): uids carry no underscore, so the last
// one splits the id, and each half must be a safe doc id on its own.
function isReportId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const split = value.lastIndexOf('_');
  if (split <= 0) return false;
  const messageId = value.slice(0, split);
  const reporterUid = value.slice(split + 1);
  return isSafeDocId(messageId) && isSafeDocId(reporterUid) && chatReportId(messageId, reporterUid) === value;
}

function iso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function toReport(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    messageId: text(data.messageId) ?? '',
    channelId: text(data.channelId) ?? '',
    channelName: text(data.channelName),
    reporterUid: text(data.reporterUid) ?? '',
    reporterName: text(data.reporterName),
    reason: text(data.reason) ?? 'other',
    details: text(data.details),
    messageText: typeof data.messageText === 'string' ? data.messageText : '',
    // Once the message is removed its chat upload is gone; the copy saved to
    // the moderation folder (evidenceUrl) is what the queue shows from then on.
    attachmentUrl: text(data.evidenceUrl) ?? text(data.attachmentUrl),
    evidencePath: text(data.evidencePath),
    attachmentType: text(data.attachmentType),
    authorId: text(data.authorId) ?? '',
    authorName: text(data.authorName),
    messageCreatedAt: iso(data.messageCreatedAt),
    createdAt: iso(data.createdAt),
    status: text(data.status) ?? 'open',
    resolvedBy: text(data.resolvedBy),
    resolvedByName: text(data.resolvedByName),
    resolvedAt: iso(data.resolvedAt),
  };
}

export type ChatReportView = ReturnType<typeof toReport>;

const byNewest = (key: 'createdAt' | 'resolvedAt') => (a: ChatReportView, b: ChatReportView) =>
  (b[key] ?? '').localeCompare(a[key] ?? '');

export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const status = request.nextUrl.searchParams.get('status') ?? 'open';
  if (status !== 'open' && status !== 'resolved') {
    return NextResponse.json({ error: 'status must be open or resolved' }, { status: 400 });
  }

  try {
    // Equality filters only, sorted here: no composite index to deploy.
    const reports = adminDb.collection('chatReports');
    const snaps =
      status === 'open'
        ? [await reports.where('status', '==', 'open').get()]
        : await Promise.all(ACTIONS.map((action) => reports.where('status', '==', action).get()));
    const rows = snaps
      .flatMap((snap) => snap.docs.map((doc) => toReport(doc.id, doc.data())))
      .sort(byNewest(status === 'open' ? 'createdAt' : 'resolvedAt'))
      .slice(0, LIST_LIMIT);
    return NextResponse.json({ reports: rows });
  } catch (error) {
    console.error('[chat reports] list failed', error);
    return NextResponse.json({ error: 'Failed to load chat reports' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const action = body.action as ReportAction;
  if (!isReportId(id)) return NextResponse.json({ error: 'A valid report id is required' }, { status: 400 });
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'action must be removed or dismissed' }, { status: 400 });
  }

  try {
    const reports = adminDb.collection('chatReports');
    const snap = await reports.doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    const messageId = text(snap.data()?.messageId);

    // One outcome per message: other people's open reports on it close with this one.
    const siblings = messageId ? (await reports.where('messageId', '==', messageId).get()).docs : [];
    const refs = new Map<string, FirebaseFirestore.DocumentReference>([[id, snap.ref]]);
    for (const doc of siblings) {
      if (doc.data().status === 'open') refs.set(doc.id, doc.ref);
    }

    const resolution = {
      status: action,
      resolvedBy: gate.uid,
      resolvedByName: gate.name,
      resolvedAt: FieldValue.serverTimestamp(),
    };
    const batch = adminDb.batch();
    for (const ref of refs.values()) batch.update(ref, resolution);
    await batch.commit();

    return NextResponse.json({ success: true, resolved: [...refs.keys()] });
  } catch (error) {
    console.error('[chat reports] resolve failed', error);
    return NextResponse.json({ error: 'Failed to update the report' }, { status: 500 });
  }
}
