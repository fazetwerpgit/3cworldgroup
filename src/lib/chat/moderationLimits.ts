import { adminDb } from '@/lib/firebase/admin';

// Rate limits for chat moderation (App Store guideline 1.2 abuse paths): one
// back-office alert per actor per ALERT_WINDOW_MS, later ones folded into the
// next alert's "N more" count; at most BLOCKS_PER_DAY new blocks per person per
// UTC day. State lives in chatModerationLimits/{uid} (Admin SDK only; the rules'
// default deny covers it). Both limits fail open: a Firestore hiccup must not
// stop a report alert or a block.

export const ALERT_WINDOW_MS = 10 * 60_000;
export const BLOCKS_PER_DAY = 50;
const LIMITS_COLLECTION = 'chatModerationLimits';

export interface AlertThrottleState {
  alertLastSentAt?: number;
  alertSuppressed?: number;
}

/** Send now (with how many alerts were folded since the last one), or fold this one. */
export function throttleDecision(
  state: AlertThrottleState | undefined,
  nowMs: number
): { send: boolean; folded: number; next: AlertThrottleState } {
  const last = typeof state?.alertLastSentAt === 'number' ? state.alertLastSentAt : 0;
  const suppressed = typeof state?.alertSuppressed === 'number' ? state.alertSuppressed : 0;
  if (last && nowMs - last < ALERT_WINDOW_MS) {
    return { send: false, folded: 0, next: { alertLastSentAt: last, alertSuppressed: suppressed + 1 } };
  }
  return { send: true, folded: suppressed, next: { alertLastSentAt: nowMs, alertSuppressed: 0 } };
}

export interface BlockQuotaState {
  blockDay?: string;
  blockCount?: number;
}

export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Whether one more block fits in today's quota, and the state after taking it. */
export function blockQuotaDecision(
  state: BlockQuotaState | undefined,
  nowMs: number
): { allowed: boolean; next: BlockQuotaState } {
  const day = utcDayKey(nowMs);
  const count = state?.blockDay === day && typeof state.blockCount === 'number' ? state.blockCount : 0;
  if (count >= BLOCKS_PER_DAY) return { allowed: false, next: { blockDay: day, blockCount: count } };
  return { allowed: true, next: { blockDay: day, blockCount: count + 1 } };
}

async function withLimits<T>(
  uid: string,
  decide: (data: Record<string, unknown> | undefined) => { result: T; patch: Record<string, unknown> | null },
  fallback: T
): Promise<T> {
  if (!adminDb) return fallback;
  const db = adminDb;
  try {
    const ref = db.collection(LIMITS_COLLECTION).doc(uid);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const { result, patch } = decide(snap.exists ? snap.data() : undefined);
      if (patch) tx.set(ref, patch, { merge: true });
      return result;
    });
  } catch (err) {
    console.error('[chat moderation] limit check failed, allowing', err);
    return fallback;
  }
}

/** Takes the actor's alert slot: { send: false } inside the window. */
export function takeAlertSlot(actorId: string, nowMs = Date.now()): Promise<{ send: boolean; folded: number }> {
  return withLimits(
    actorId,
    (data) => {
      const decision = throttleDecision(data as AlertThrottleState | undefined, nowMs);
      return { result: { send: decision.send, folded: decision.folded }, patch: { ...decision.next } };
    },
    { send: true, folded: 0 }
  );
}

/** Takes one of today's blocks for this person: false once the day's quota is used. */
export function takeBlockSlot(uid: string, nowMs = Date.now()): Promise<boolean> {
  return withLimits(
    uid,
    (data) => {
      const decision = blockQuotaDecision(data as BlockQuotaState | undefined, nowMs);
      return { result: decision.allowed, patch: decision.allowed ? { ...decision.next } : null };
    },
    true
  );
}
