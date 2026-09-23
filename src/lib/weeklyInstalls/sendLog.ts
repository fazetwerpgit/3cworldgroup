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

/** true when this run now owns the send; false when a send for this key already happened. */
export async function claimSend(db: Db, id: string, claim: SendClaim, now: Date): Promise<boolean> {
  try {
    await db
      .collection(SEND_LOG_COLLECTION)
      .doc(id)
      .create({ ...claim, status: 'sending', claimedAt: now.toISOString() });
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  }
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
