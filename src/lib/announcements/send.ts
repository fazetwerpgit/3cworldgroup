import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { sendPushToTokens, type PushPayload } from '@/lib/push/sendPush';
import { ANNOUNCEMENT_URL, type AnnouncementStatus, type AnnouncementView } from './schedule';

// Server side of owner announcements: who receives them, the fan-out, and the
// cron's due-and-claim loop. The announcements collection is server-only
// (firestore.rules denies every client read and write).

export const ANNOUNCEMENTS = 'announcements';

// Parallel users per batch: bounded so a company-wide send doesn't open
// hundreds of FCM requests at once.
const SEND_CONCURRENCY = 10;

export interface FanOutResult {
  /** Users at least one of whose devices accepted the push. */
  sentCount: number;
  /** Users with devices where none accepted it. */
  failedCount: number;
}

function tokensOf(data: FirebaseFirestore.DocumentData): string[] {
  const raw = Array.isArray(data.pushTokens) ? data.pushTokens : [];
  return raw.filter((token): token is string => typeof token === 'string' && token.length > 0);
}

/** Every active user (any role) with at least one registered device. */
export async function announcementRecipients(db: Firestore): Promise<Array<{ uid: string; tokens: string[] }>> {
  const snap = await db.collection('users').where('status', '==', 'active').get();
  const recipients: Array<{ uid: string; tokens: string[] }> = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    // The query already filters; this guards against a doc changing shape.
    if (data.status !== 'active') continue;
    const tokens = tokensOf(data);
    if (tokens.length) recipients.push({ uid: doc.id, tokens });
  }
  return recipients;
}

export async function sendToRecipients(
  recipients: Array<{ uid: string; tokens: string[] }>,
  payload: PushPayload
): Promise<FanOutResult> {
  let sentCount = 0;
  let failedCount = 0;
  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const batch = recipients.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(batch.map((r) => sendPushToTokens(r.uid, r.tokens, payload)));
    for (const result of results) {
      if (result.delivered > 0) sentCount += 1;
      else failedCount += 1;
    }
  }
  return { sentCount, failedCount };
}

/** The owner's "Send a test to me": only the caller's own devices. */
export async function sendTestToSelf(
  db: Firestore,
  uid: string,
  message: { title: string; body: string }
): Promise<{ devices: number; delivered: number }> {
  const snap = await db.collection('users').doc(uid).get();
  const tokens = tokensOf(snap.data() ?? {});
  if (!tokens.length) return { devices: 0, delivered: 0 };
  const result = await sendPushToTokens(uid, tokens, { ...message, url: ANNOUNCEMENT_URL });
  return { devices: tokens.length, delivered: result.delivered };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function toAnnouncementView(id: string, data: FirebaseFirestore.DocumentData): AnnouncementView {
  return {
    id,
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    sendAt: toDate(data.sendAt)?.toISOString() ?? null,
    status: (data.status ?? 'scheduled') as AnnouncementStatus,
    createdBy: String(data.createdBy ?? ''),
    createdAt: toDate(data.createdAt)?.toISOString() ?? null,
    sentAt: toDate(data.sentAt)?.toISOString() ?? null,
    sentCount: Number(data.sentCount ?? 0),
    failedCount: Number(data.failedCount ?? 0),
  };
}

export interface CronSummary {
  due: number;
  sent: string[];
  skipped: string[];
  failed: string[];
}

// Claims one announcement for sending. The status flip happens inside a
// transaction, so of two overlapping cron runs exactly one sees 'scheduled' and
// sends; the other sees 'sending' (or 'sent') and skips.
async function claim(db: Firestore, id: string, now: Date): Promise<FirebaseFirestore.DocumentData | null> {
  const ref = db.collection(ANNOUNCEMENTS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !data || data.status !== 'scheduled') return null;
    const sendAt = toDate(data.sendAt);
    if (!sendAt || sendAt.getTime() > now.getTime()) return null;
    tx.update(ref, { status: 'sending', sendingAt: FieldValue.serverTimestamp() });
    return data;
  });
}

/** Sends every scheduled announcement whose sendAt has passed. */
export async function runDueAnnouncements({ db, now }: { db: Firestore; now: Date }): Promise<CronSummary> {
  // Equality-only query (no composite index); the due check runs here and again
  // inside the claim transaction.
  const snap = await db.collection(ANNOUNCEMENTS).where('status', '==', 'scheduled').get();
  const due = snap.docs
    .filter((doc) => {
      const sendAt = toDate(doc.data().sendAt);
      return sendAt !== null && sendAt.getTime() <= now.getTime();
    })
    .sort((a, b) => (toDate(a.data().sendAt)?.getTime() ?? 0) - (toDate(b.data().sendAt)?.getTime() ?? 0));

  const summary: CronSummary = { due: due.length, sent: [], skipped: [], failed: [] };
  if (!due.length) return summary;

  let recipients: Array<{ uid: string; tokens: string[] }> | null = null;
  for (const doc of due) {
    const data = await claim(db, doc.id, now);
    if (!data) {
      summary.skipped.push(doc.id);
      continue;
    }
    const ref = db.collection(ANNOUNCEMENTS).doc(doc.id);
    try {
      recipients ??= await announcementRecipients(db);
      const result = await sendToRecipients(recipients, {
        title: String(data.title),
        body: String(data.body),
        url: ANNOUNCEMENT_URL,
      });
      await ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), ...result });
      summary.sent.push(doc.id);
    } catch (err) {
      console.error('Announcement send failed', doc.id, err);
      // Never back to 'scheduled': a partial send retried would double-notify.
      await ref
        .update({ status: 'failed', error: err instanceof Error ? err.message.slice(0, 240) : 'Send failed' })
        .catch(() => undefined);
      summary.failed.push(doc.id);
    }
  }
  return summary;
}
