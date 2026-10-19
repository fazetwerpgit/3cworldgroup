import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { sendPushToTokens, type PushPayload } from '@/lib/push/sendPush';
import { pushTargetsOf } from '@/lib/push/pushTargets';
import { ANNOUNCEMENT_URL, type AnnouncementStatus, type AnnouncementView } from './schedule';
import { isDemoAccount } from '@/lib/users/demoAccount';

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

/** One user's devices: web tokens, plus the 3C iOS app's when they have it. */
export interface Recipient {
  uid: string;
  tokens: string[];
  nativeTokens?: string[];
}

function recipientOf(uid: string, data: FirebaseFirestore.DocumentData): Recipient {
  const { web, native } = pushTargetsOf(data);
  return native.length ? { uid, tokens: web, nativeTokens: native } : { uid, tokens: web };
}

// Web-only recipients are sent the plain token array, exactly as before the app.
function targetsOf(r: Recipient) {
  return r.nativeTokens?.length ? { web: r.tokens, native: r.nativeTokens } : r.tokens;
}

/** Every active user (any role) with at least one registered device. */
export async function announcementRecipients(db: Firestore): Promise<Recipient[]> {
  const snap = await db.collection('users').where('status', '==', 'active').get();
  const recipients: Recipient[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    // The query already filters; this guards against a doc changing shape.
    if (data.status !== 'active' || isDemoAccount(data)) continue;
    const recipient = recipientOf(doc.id, data);
    if (recipient.tokens.length || recipient.nativeTokens?.length) recipients.push(recipient);
  }
  return recipients;
}

export async function sendToRecipients(recipients: Recipient[], payload: PushPayload): Promise<FanOutResult> {
  let sentCount = 0;
  let failedCount = 0;
  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const batch = recipients.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(batch.map((r) => sendPushToTokens(r.uid, targetsOf(r), payload)));
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
  const recipient = recipientOf(uid, snap.data() ?? {});
  const devices = recipient.tokens.length + (recipient.nativeTokens?.length ?? 0);
  if (!devices) return { devices: 0, delivered: 0 };
  const result = await sendPushToTokens(uid, targetsOf(recipient), { ...message, url: ANNOUNCEMENT_URL });
  return { devices, delivered: result.delivered };
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
  /** Stuck in `sending` before any push went out: put back to `scheduled` and retried. */
  requeued: string[];
  /** Stuck in `sending` after the fan-out began: marked `failed` (partial), never resent. */
  stalled: string[];
}

/** A send that has sat in `sending` this long died with its function (timeout, crash). */
export const STALE_SENDING_MS = 10 * 60 * 1000;
export const STALLED_ERROR = 'Timed out mid-send: some people may have received it. Not resent.';

/**
 * Recovers announcements a dead run left in `sending`. Before the fan-out began
 * nobody was pushed, so it goes back to `scheduled` and this run sends it.
 * After, it may have reached people, so it is marked `failed` (partial) for the
 * owner to see, never resent. Each flip is re-checked in a transaction.
 */
export async function recoverStaleSending(
  db: Firestore,
  now: Date
): Promise<{ requeued: string[]; stalled: string[] }> {
  const out = { requeued: [] as string[], stalled: [] as string[] };
  const snap = await db.collection(ANNOUNCEMENTS).where('status', '==', 'sending').get();
  const isStale = (data: FirebaseFirestore.DocumentData | undefined) => {
    const at = toDate(data?.sendingAt);
    return !!at && now.getTime() - at.getTime() >= STALE_SENDING_MS;
  };
  for (const doc of snap.docs) {
    if (!isStale(doc.data())) continue;
    const ref = db.collection(ANNOUNCEMENTS).doc(doc.id);
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        const data = fresh.data();
        if (!fresh.exists || data?.status !== 'sending' || !isStale(data)) return null;
        if (data.fanOutStarted) {
          tx.update(ref, { status: 'failed', error: STALLED_ERROR });
          return 'stalled' as const;
        }
        tx.update(ref, { status: 'scheduled' });
        return 'requeued' as const;
      });
      if (outcome) out[outcome].push(doc.id);
    } catch (error) {
      console.error('Announcement stale-send recovery failed', doc.id, error);
    }
  }
  return out;
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

export type SendOutcome =
  | ({ status: 'sent' } & FanOutResult)
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

type Recipients = Recipient[];

/**
 * The one send path, shared by the cron and the owner's "Send now": claim the
 * announcement, push it to every recipient, record the counts. Anything not
 * claimable (already claimed, cancelled, not yet due) is skipped.
 */
export async function sendAnnouncement(
  db: Firestore,
  id: string,
  now: Date,
  recipients?: () => Promise<Recipients>
): Promise<SendOutcome> {
  const data = await claim(db, id, now);
  if (!data) return { status: 'skipped' };
  const ref = db.collection(ANNOUNCEMENTS).doc(id);
  let pushing = false;
  try {
    const list = await (recipients ?? (() => announcementRecipients(db)))();
    // From here pushes go out. A failure after this point may have reached
    // people, so the owner's retry must not send it again.
    await ref.update({ fanOutStarted: true });
    pushing = true;
    const result = await sendToRecipients(list, {
      title: String(data.title),
      body: String(data.body),
      url: ANNOUNCEMENT_URL,
    });
    await ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), ...result });
    return { status: 'sent', ...result };
  } catch (err) {
    console.error('Announcement send failed', id, err);
    const error = err instanceof Error ? err.message.slice(0, 240) : 'Send failed';
    // Once pushes started, never back to 'scheduled': a partial send retried
    // would double-notify. Before that nobody was pushed, so a cron-scheduled
    // one goes back to 'scheduled' for the next run (as recoverStaleSending
    // does). A Send-now one stays 'failed': the owner retries it with the same
    // requestId, and it must not go out later on its own.
    const status = !pushing && !data.sendNow ? 'scheduled' : 'failed';
    await ref.update({ status, error }).catch(() => undefined);
    return { status: 'failed', error };
  }
}

/** Sends every scheduled announcement whose sendAt has passed. */
export async function runDueAnnouncements({ db, now }: { db: Firestore; now: Date }): Promise<CronSummary> {
  // First, anything a dead run left in `sending` (requeued ones are sent below).
  const { requeued, stalled } = await recoverStaleSending(db, now);
  // Equality-only query (no composite index); the due check runs here and again
  // inside the claim transaction.
  const snap = await db.collection(ANNOUNCEMENTS).where('status', '==', 'scheduled').get();
  const due = snap.docs
    .filter((doc) => {
      const sendAt = toDate(doc.data().sendAt);
      return sendAt !== null && sendAt.getTime() <= now.getTime();
    })
    .sort((a, b) => (toDate(a.data().sendAt)?.getTime() ?? 0) - (toDate(b.data().sendAt)?.getTime() ?? 0));

  const summary: CronSummary = { due: due.length, sent: [], skipped: [], failed: [], requeued, stalled };
  if (!due.length) return summary;

  // One recipients read per run, however many announcements are due.
  let cached: Promise<Recipients> | null = null;
  // A failed read is not reused: the next due announcement reads again.
  const recipients = () =>
    (cached ??= announcementRecipients(db).catch((err) => {
      cached = null;
      throw err;
    }));
  for (const doc of due) {
    const outcome = await sendAnnouncement(db, doc.id, now, recipients);
    summary[outcome.status].push(doc.id);
  }
  return summary;
}
