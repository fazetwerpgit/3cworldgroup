import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { chatObjectPathFromUrl, getChatStorageBucketName } from '@/lib/chat/media';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { chatReportId, isSafeDocId } from '@/lib/chat/moderationShared';

// The chat moderation queue (App Store guideline 1.2). Reports are written by
// POST /api/portal/chat/messages/report as chatReports/{messageId}_{reporterUid}
// through the Admin SDK only; the Firestore rules deny every client read, so
// this route is the one way back-office staff see them.
//
// GET  ?status=open (default) | resolved [&cursor=<report id>]
//   open: oldest first (the longest wait on top), by createdAt.
//   resolved: most recently handled first, by resolvedAt.
//   PAGE_LIMIT rows per call; nextCursor (a report id, or null at the end)
//   fetches the next page. Both orders need a composite index on chatReports
//   (firestore.indexes.json). The nav badge reads ./count instead.
// PATCH { id, action: 'removed' | 'dismissed' } -> resolves the report and
//   every other open report on the same message, stamped with who and when.
//   Removing the message itself is the existing DELETE /api/portal/chat/messages;
//   the queue calls that first, then records the outcome here.

const PAGE_LIMIT = 50;
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

// How long a signed link to a report's upload opens it. Minted on every list
// call, so a reload of the queue renews it.
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;
const EVIDENCE_PREFIX = 'moderation/chat-reports/';

type AttachmentLink = { url: string | null; expiresAt: string | null };

async function signedRead(objectPath: string, expires: number): Promise<string | null> {
  try {
    const [url] = await getOnboardingBucket().file(objectPath).getSignedUrl({ version: 'v4', action: 'read', expires });
    return url;
  } catch (error) {
    console.error('[chat reports] could not sign an upload link', (error as { code?: unknown } | null)?.code ?? 'unknown');
    return null;
  }
}

// The link the queue shows for a report's upload. The saved moderation copy
// (evidencePath) and a chat upload still in place both get a short-lived V4
// signed URL, so no link the queue hands out keeps working. Older reports
// carry only a tokened evidenceUrl, which is shown as stored. A GIF (or a
// link that cannot be signed) falls back to the stored attachmentUrl.
async function attachmentLink(data: FirebaseFirestore.DocumentData): Promise<AttachmentLink> {
  const expires = Date.now() + SIGNED_URL_TTL_MS;
  const expiresAt = new Date(expires).toISOString();
  const evidencePath = text(data.evidencePath);
  if (evidencePath && evidencePath.startsWith(EVIDENCE_PREFIX) && !evidencePath.includes('..')) {
    const url = await signedRead(evidencePath, expires);
    if (url) return { url, expiresAt };
  }
  const legacyEvidence = text(data.evidenceUrl);
  if (legacyEvidence) return { url: legacyEvidence, expiresAt: null };
  const attachmentUrl = text(data.attachmentUrl);
  const bucketName = getChatStorageBucketName();
  const channelId = text(data.channelId);
  const chatPath = attachmentUrl && bucketName && channelId ? chatObjectPathFromUrl(attachmentUrl, bucketName, channelId) : null;
  if (chatPath) {
    const url = await signedRead(chatPath, expires);
    if (url) return { url, expiresAt };
  }
  return { url: attachmentUrl, expiresAt: null };
}

function toReport(id: string, data: FirebaseFirestore.DocumentData, link: AttachmentLink) {
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
    // the moderation folder (evidencePath) is what the queue shows from then on.
    // A signed link stops working at attachmentExpiresAt (null: not signed).
    attachmentUrl: link.url,
    attachmentExpiresAt: link.expiresAt,
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

export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? 'open';
  if (status !== 'open' && status !== 'resolved') {
    return NextResponse.json({ error: 'status must be open or resolved' }, { status: 400 });
  }
  const cursor = params.get('cursor');
  if (cursor !== null && !isReportId(cursor)) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
  }

  try {
    const reports = adminDb.collection('chatReports');
    let query =
      status === 'open'
        ? reports.where('status', '==', 'open').orderBy('createdAt', 'asc')
        : reports.where('status', 'in', [...ACTIONS]).orderBy('resolvedAt', 'desc');
    if (cursor) {
      const after = await reports.doc(cursor).get();
      if (!after.exists) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      query = query.startAfter(after);
    }
    // One extra row says whether another page exists.
    const snap = await query.limit(PAGE_LIMIT + 1).get();
    const docs = snap.docs.slice(0, PAGE_LIMIT);
    const nextCursor = snap.docs.length > PAGE_LIMIT ? docs[docs.length - 1].id : null;
    const reportsOut = await Promise.all(
      docs.map(async (doc) => {
        const data = doc.data();
        return toReport(doc.id, data, await attachmentLink(data));
      })
    );
    return NextResponse.json({ reports: reportsOut, nextCursor });
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
