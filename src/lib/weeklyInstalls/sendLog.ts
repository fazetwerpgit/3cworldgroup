// One doc per (week, rep) in `weeklyInstallEmails`: the thing that makes the
// Monday email idempotent. The cron fires twice every Monday (13:00 and 14:00
// UTC, one of them is 8 AM Chicago) and Vercel may retry an invocation, so the
// doc is CLAIMED with create() before the send. create() fails if the doc
// already exists, which makes the claim atomic: two concurrent runs cannot both
// win it, and a rep never gets the same week twice.
//
// Only the cron calls this module. The preview and the pure builders never do.

type Db = FirebaseFirestore.Firestore;

export const SEND_LOG_COLLECTION = 'weeklyInstallEmails';

/**
 * `2026-09-13_<uid>` for a live send. A test run redirected by
 * WEEKLY_INSTALLS_EMAIL_ONLY_TO gets its own key, so the owner's test never
 * uses up the rep's real email for that week.
 */
export function sendLogId(weekFrom: string, uid: string, redirectTo: string | null): string {
  const base = `${weekFrom}_${uid}`;
  if (!redirectTo) return base;
  return `${base}__test_${redirectTo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export interface SendClaim {
  weekFrom: string;
  weekTo: string;
  uid: string;
  repName: string;
  to: string;
  redirected: boolean;
  subject: string;
  installs: number;
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

/**
 * A claim that never finished is retried by a later run (the backup slot):
 *  - `failed` (Postmark refused, timed out or the network dropped), or
 *  - `sending` older than STALE_SENDING_MS (the run died between the claim and
 *    the result),
 * up to MAX_SEND_ATTEMPTS in all. `sent` is final: a rep never gets a week twice.
 */
export const MAX_SEND_ATTEMPTS = 3;
export const STALE_SENDING_MS = 15 * 60 * 1000;

export type ClaimOutcome = 'claimed' | 'retry' | 'done';

/** Whether an existing log doc may be claimed again at `now`. Pure, for the tests. */
export function canReclaim(data: Record<string, unknown> | undefined, now: Date): boolean {
  if (!data) return false;
  const attempts = typeof data.attempts === 'number' ? data.attempts : 1;
  if (attempts >= MAX_SEND_ATTEMPTS) return false;
  if (data.status === 'failed') return true;
  if (data.status === 'sending') {
    const claimedAt = typeof data.claimedAt === 'string' ? Date.parse(data.claimedAt) : NaN;
    return Number.isFinite(claimedAt) && now.getTime() - claimedAt >= STALE_SENDING_MS;
  }
  return false;
}

/**
 * 'claimed' when this run now owns a first send; 'retry' when it took over an
 * unfinished one (failed, or stale `sending`); 'done' when the key is already
 * sent, still in flight elsewhere, or out of attempts.
 */
export async function claimSendOutcome(db: Db, id: string, claim: SendClaim, now: Date): Promise<ClaimOutcome> {
  const ref = db.collection(SEND_LOG_COLLECTION).doc(id);
  try {
    await ref.create({ ...claim, status: 'sending', claimedAt: now.toISOString(), attempts: 1 });
    return 'claimed';
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  // Re-claim in a transaction so two concurrent runs cannot both take it over.
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    if (!canReclaim(data, now)) return 'done' as const;
    const attempts = (typeof data?.attempts === 'number' ? data.attempts : 1) + 1;
    transaction.update(ref, { status: 'sending', claimedAt: now.toISOString(), attempts });
    return 'retry' as const;
  });
}

/** true when this run now owns the send; false when a send for this key already happened. */
export async function claimSend(db: Db, id: string, claim: SendClaim, now: Date): Promise<boolean> {
  return (await claimSendOutcome(db, id, claim, now)) !== 'done';
}

export async function recordSendResult(
  db: Db,
  id: string,
  result: { ok: boolean; error?: string },
  now: Date
): Promise<void> {
  await db
    .collection(SEND_LOG_COLLECTION)
    .doc(id)
    .set(
      result.ok
        ? { status: 'sent', sentAt: now.toISOString() }
        : { status: 'failed', error: result.error ?? 'unknown', failedAt: now.toISOString() },
      { merge: true }
    );
}
