import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { createAlertTask, resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { appBaseUrl, esignSentEmail } from '@/lib/email/templates';
import { onboardingFrom, sendEmail } from '@/lib/email/sendEmail';
import { emailFromUserDoc } from '@/lib/email/userEmail';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import { isHeldOnboardingItem } from '@/types/onboardingHold';
import { isEsignItem } from '@/lib/onboarding/esign';
import { roleRequiresOnboarding, type FieldRole } from '@/types/auth';
import { createEnvelope, envelopeExists } from './inhouse';
import type { EsignDocKey } from './types';

const MIN_RETRY_INTERVAL_MS = 5 * 60 * 1000;
const CLAIM_STALE_MS = 2 * 60 * 1000;
const READY_EMAIL_INTERVAL_MS = 10 * 60 * 1000;
/**
 * How long an invite-link hire has to sign on the spot before the deferred
 * "ready to sign" email may go out. The onboarding-nudges cron runs daily, so
 * the real delay is this plus up to a day.
 */
export const DEFERRED_READY_EMAIL_DELAY_MS = 60 * 60 * 1000;
/** users/{uid} field: the ready-to-sign email was held back at this time. */
export const DEFERRED_READY_EMAIL_FIELD = 'esignReadyEmailDeferredAt';
const MAX_ERROR_LENGTH = 500;
const ALERT_KIND = 'review_needed' as const;

interface EsignDispatchState {
  state?: string;
  attempts?: number;
  lastAttemptAt?: unknown;
}

interface PendingItem {
  item: ReturnType<typeof getOnboardingItemsForUser>[number];
  ref: ReturnType<NonNullable<typeof adminDb>['doc']>;
  snap: Awaited<ReturnType<ReturnType<NonNullable<typeof adminDb>['doc']>['get']>>;
  /**
   * An unsigned item's envelope id that names no envelope record. Items sent
   * before signing moved in-house carry such ids; they get a fresh envelope,
   * which replaces the id. Approved items are never looked at, so a signed
   * document is never resent.
   */
  staleEnvelopeId?: string;
}

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const maybeTimestamp = value as { toDate?: () => Date };
  return typeof maybeTimestamp.toDate === 'function' ? maybeTimestamp.toDate() : undefined;
}

function dispatchState(snap: { get: (field: string) => unknown }): EsignDispatchState {
  const value = snap.get('esignDispatch');
  return value && typeof value === 'object' ? (value as EsignDispatchState) : {};
}

function previousAttempts(state: EsignDispatchState): number {
  return typeof state.attempts === 'number' && Number.isFinite(state.attempts)
    ? state.attempts
    : 0;
}

function isThrottled(state: EsignDispatchState, now: Date): boolean {
  const lastAttemptAt = asDate(state.lastAttemptAt);
  return !!lastAttemptAt && now.getTime() - lastAttemptAt.getTime() < MIN_RETRY_INTERVAL_MS;
}

async function recordFailure(
  pending: PendingItem,
  userId: string,
  error: unknown
): Promise<{ previousAttempts: number; attempts: number } | null> {
  try {
    const state = dispatchState(pending.snap);
    const before = previousAttempts(state);
    const attempts = before + 1;
    await pending.ref.set(
      {
        userId,
        itemId: pending.item.id,
        esignDispatch: {
          state: 'failed',
          attempts,
          lastError: String(error).slice(0, MAX_ERROR_LENGTH),
          lastAttemptAt: new Date(),
        },
      },
      { merge: true }
    );
    return { previousAttempts: before, attempts };
  } catch (recordError) {
    console.error(`[esign] failed to record dispatch failure for ${userId}/${pending.item.id}`, recordError);
    return null;
  }
}

/**
 * Two checklist reads for the same rep can arrive at once — the portal issues
 * them together on login — and each used to create its own envelope for every
 * item: ten envelopes instead of five, and the "ready to sign" email twice.
 *
 * Each item is now claimed in a transaction before its envelope is created.
 * The transaction re-reads the document, so the loser of the race sees either
 * the winner's envelope id or its 'sending' marker and skips the item.
 *
 * A 'sending' marker older than two minutes counts as free: a dispatch that
 * crashed mid-flight must not brick the item forever.
 */
async function claimForDispatch(pending: PendingItem, userId: string): Promise<boolean> {
  try {
    return await adminDb!.runTransaction(async (transaction) => {
      const fresh = await transaction.get(pending.ref);
      // Another caller already replaced the id (or the item got one) since it was read.
      const currentEnvelopeId = fresh.get('esignEnvelopeId');
      if (currentEnvelopeId && currentEnvelopeId !== pending.staleEnvelopeId) return false;

      const state = dispatchState(fresh);
      if (state.state === 'sending') {
        const lastAttemptAt = asDate(state.lastAttemptAt);
        if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < CLAIM_STALE_MS) return false;
      }

      transaction.set(
        pending.ref,
        {
          userId,
          itemId: pending.item.id,
          esignDispatch: { state: 'sending', lastAttemptAt: new Date() },
        },
        { merge: true }
      );
      return true;
    });
  } catch (error) {
    console.error(`[esign] failed to claim ${userId}/${pending.item.id} for dispatch`, error);
    return false;
  }
}

/**
 * The per-item claim stops duplicate envelopes, but not duplicate email: two
 * concurrent callers each claim a subset of the items and each would then tell
 * the rep their documents are ready. One notice per rep per ten minutes is
 * enough, because the message points at the checklist rather than listing the
 * whole set — the winner names only the documents it sent, and the checklist is
 * the source of truth for the rest.
 *
 * Ten minutes rather than forever: a rejected document is re-sent later, and
 * that resend has to be able to reach the rep.
 */
async function claimReadyEmail(
  userId: string,
  now: Date
): Promise<{ claimed: boolean; hadDeferred: boolean }> {
  const refused = { claimed: false, hadDeferred: false };
  try {
    const ref = adminDb!.doc(`users/${userId}`);
    return await adminDb!.runTransaction(async (transaction) => {
      const fresh = await transaction.get(ref);
      const lastSentAt = asDate(fresh.get('esignReadyEmailAt'));
      if (lastSentAt && now.getTime() - lastSentAt.getTime() < READY_EMAIL_INTERVAL_MS) {
        return refused;
      }
      // This notice supersedes any held-back one from the invite link, so the
      // caller must then list everything unsigned, not just what it sent now.
      const hadDeferred = !!fresh.get(DEFERRED_READY_EMAIL_FIELD);
      transaction.set(
        ref,
        { esignReadyEmailAt: now, [DEFERRED_READY_EMAIL_FIELD]: FieldValue.delete() },
        { merge: true }
      );
      return { claimed: true, hadDeferred };
    });
  } catch (error) {
    // The envelopes are already created and the checklist already shows them.
    // A failed claim costs the rep a notification, never a document, so it is
    // logged and swallowed rather than risking a second email.
    console.error(`[esign] failed to claim the ready-to-sign notice for ${userId}`, error);
    return refused;
  }
}

async function raiseDispatchAlert(userId: string, signerName: string): Promise<void> {
  try {
    await createAlertTask({
      kind: ALERT_KIND,
      subjectUserId: userId,
      subjectName: signerName,
      title: 'E-signature delivery needs attention',
      message: `${signerName} has a document that could not be sent for signature after repeated attempts.`,
      link: '/portal/admin/onboarding',
    });
  } catch (error) {
    console.error(`[esign] failed to raise dispatch alert for ${userId}`, error);
  }
}

async function resolveDispatchAlert(userId: string): Promise<void> {
  try {
    await resolveAlertTasks(userId, [ALERT_KIND]);
  } catch (error) {
    console.error(`[esign] failed to resolve dispatch alert for ${userId}`, error);
  }
}

async function hasFailedDispatch(userId: string): Promise<boolean> {
  try {
    const snapshot = await adminDb!.collection('userOnboarding').where('userId', '==', userId).get();
    // A held placeholder is never retried, so its old failure must not keep the alert open.
    return snapshot.docs.some(
      (doc) => dispatchState(doc).state === 'failed' && !isHeldOnboardingItem(String(doc.get('itemId')))
    );
  } catch (error) {
    console.error(`[esign] failed to inspect dispatch failures for ${userId}`, error);
    return true;
  }
}

async function sendOne(
  pending: PendingItem,
  userId: string,
  signerName: string,
  signerEmail: string
): Promise<{ sent: boolean; recovered?: boolean; failed?: { previousAttempts: number; attempts: number } }> {
  let envelopeId: string;
  try {
    const rawPrefill = pending.snap.get('prefill');
    const prefill =
      rawPrefill && typeof rawPrefill === 'object' && !Array.isArray(rawPrefill)
        ? (rawPrefill as Record<string, string>)
        : undefined;
    ({ envelopeId } = await createEnvelope({
      docKey: pending.item.id as EsignDocKey,
      userId,
      itemId: pending.item.id,
      signerName,
      signerEmail,
      ...(prefill ? { prefill } : {}),
    }));
  } catch (error) {
    console.error(`[esign] envelope creation failed for ${userId}/${pending.item.id}`, error);
    return { sent: false, failed: (await recordFailure(pending, userId, error)) ?? undefined };
  }

  const now = new Date();
  const hadFailedDispatch = dispatchState(pending.snap).state === 'failed';
  const persistence = {
    userId,
    itemId: pending.item.id,
    status: 'submitted',
    reference: `esign:${envelopeId}`,
    esignEnvelopeId: envelopeId,
    esignDispatch: FieldValue.delete(),
    submittedAt: now,
    updatedAt: now,
  };

  try {
    await pending.ref.set(persistence, { merge: true });
  } catch (firstError) {
    try {
      await pending.ref.set(persistence, { merge: true });
    } catch (error) {
      console.error(`[esign] envelope was created but its record failed to persist for ${userId}/${pending.item.id}`, {
        envelopeId,
        userId,
        itemId: pending.item.id,
        error,
        firstError,
      });
      return { sent: false, failed: (await recordFailure(pending, userId, error)) ?? undefined };
    }
  }

  return { sent: true, recovered: hadFailedDispatch };
}

export interface SendPendingOptions {
  /**
   * The invite link signs the documents on the spot, so it must not email
   * "your documents are ready" at the hire who is looking at them. Instead the
   * user is marked, and the onboarding-nudges cron sends that email later only
   * if something is still unsigned (sendDeferredEsignReadyEmails).
   */
  deferReadyEmail?: boolean;
  /**
   * Only replace stale envelopes (ids with no envelope record); never send a
   * document that was not sent before. For active reps who still owe
   * signatures from before signing moved in-house.
   */
  onlyStale?: boolean;
}

/**
 * Creates or retries e-sign envelopes for applicable items. This function is
 * deliberately failure-contained: callers receive whatever was sent, while
 * envelope and persistence failures are recorded/logged and never re-thrown.
 */
export async function sendPendingEsignDocs(
  userId: string,
  options: SendPendingOptions = {}
): Promise<string[]> {
  if (!adminDb) return [];

  const sent: string[] = [];
  try {
    const userSnap = await adminDb.doc(`users/${userId}`).get();
    if (!userSnap.exists) return sent;

    const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
    if (!fieldRole) return sent;

    // Last line of defence for every call site: only a pending or active hire
    // may have documents sent. Decommissioned, suspended, and other statuses
    // must never trigger envelope dispatch.
    if (!['pending', 'active'].includes(userSnap.get('status') as string)) return sent;
    if (!roleRequiresOnboarding(fieldRole)) return sent;

    const signerName = (userSnap.get('displayName') as string | undefined) ?? 'Rep';
    const signerEmail = userSnap.get('email') as string | undefined;
    if (!signerEmail) return sent;

    const items = getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO')).filter((item) =>
      isEsignItem(item.id)
    );
    const now = new Date();
    const pending: PendingItem[] = [];

    for (const item of items) {
      try {
        const ref = adminDb.doc(`userOnboarding/${userId}_${item.id}`);
        const snap = await ref.get();
        const state = dispatchState(snap);
        const status = (snap.get('status') as string | undefined) ?? 'not_started';
        if (!['not_started', 'submitted', 'rejected'].includes(status)) continue;
        const existingEnvelopeId = snap.get('esignEnvelopeId');
        let stale: string | undefined;
        if (typeof existingEnvelopeId === 'string' && existingEnvelopeId) {
          // A failed read throws into the catch below: the item is skipped,
          // never resent on a guess.
          if (await envelopeExists(existingEnvelopeId)) continue;
          stale = existingEnvelopeId;
        } else if (existingEnvelopeId) {
          continue;
        }
        if (options.onlyStale && !stale) continue;
        if (isThrottled(state, now)) continue;
        pending.push({ item, ref, snap, ...(stale ? { staleEnvelopeId: stale } : {}) });
      } catch (error) {
        console.error(`[esign] failed to inspect ${userId}/${item.id}`, error);
      }
    }

    if (pending.length === 0) return sent;

    let alertRaised = false;
    let recovered = false;
    const sentLabels: string[] = [];
    for (const item of pending) {
      // Another caller is already dispatching this item; it sends the email.
      if (!(await claimForDispatch(item, userId))) continue;

      const result = await sendOne(item, userId, signerName, signerEmail);
      if (result.sent) {
        sent.push(item.item.id);
        sentLabels.push(item.item.label);
        recovered ||= !!result.recovered;
      } else if (
        !alertRaised &&
        result.failed &&
        result.failed.attempts >= 3
      ) {
        alertRaised = true;
        await raiseDispatchAlert(userId, signerName);
      }
    }

    if (recovered && !(await hasFailedDispatch(userId))) {
      await resolveDispatchAlert(userId);
    }

    if (sentLabels.length > 0 && options.deferReadyEmail) {
      try {
        await adminDb
          .doc(`users/${userId}`)
          .set({ [DEFERRED_READY_EMAIL_FIELD]: new Date() }, { merge: true });
      } catch (error) {
        console.error(`[esign] failed to defer the ready-to-sign notice for ${userId}`, error);
      }
    } else if (sentLabels.length > 0) {
      const claim = await claimReadyEmail(userId, new Date());
      if (claim.claimed) {
        try {
          // The held-back invite notice was never sent, so this one has to
          // carry every document still waiting, not only the new ones.
          let docLabels = sentLabels;
          if (claim.hadDeferred) {
            const unsigned = await unsignedEsignLabels(userId, fieldRole, !!userSnap.get('isIBO'));
            docLabels = [...new Set([...unsigned, ...sentLabels])];
          }
          await dispatchToUser({
            userId,
            type: 'system',
            title: 'Documents sent for signature',
            message: `Ready to sign: ${docLabels.join(', ')}`,
            link: '/portal/onboarding',
            email: esignSentEmail({
              name: signerName,
              docLabels,
              portalUrl: `${appBaseUrl()}/portal/onboarding`,
            }),
            emailFrom: onboardingFrom(),
          });
        } catch (error) {
          console.error(`[esign] failed to notify ${userId} about sent documents`, error);
        }
      }
    }
  } catch (error) {
    console.error(`[esign] pending document send failed for ${userId}`, error);
  }

  return sent;
}

/** The e-sign documents this user was sent and has not signed yet, by label. */
async function unsignedEsignLabels(
  userId: string,
  fieldRole: FieldRole,
  isIBO: boolean
): Promise<string[]> {
  const items = getOnboardingItemsForUser(fieldRole, isIBO).filter((item) => isEsignItem(item.id));
  const snapshot = await adminDb!.collection('userOnboarding').where('userId', '==', userId).get();
  const byItem = new Map(snapshot.docs.map((doc) => [String(doc.get('itemId')), doc]));
  return items
    .filter((item) => {
      const doc = byItem.get(item.id);
      return !!doc?.get('esignEnvelopeId') && doc.get('status') !== 'approved';
    })
    .map((item) => item.label);
}

/**
 * Puts the held-back marker back after a failed send, so the next cron run
 * tries again. Only this run's claim is undone: if a portal notice went out in
 * the meantime (esignReadyEmailAt moved on) the rep already has an email and
 * the marker stays cleared.
 */
async function releaseDeferredClaim(
  ref: FirebaseFirestore.DocumentReference,
  deferredAt: unknown,
  claimedAt: Date
): Promise<void> {
  try {
    await adminDb!.runTransaction(async (transaction) => {
      const fresh = await transaction.get(ref);
      const lastSentAt = asDate(fresh.get('esignReadyEmailAt'));
      if (!lastSentAt || lastSentAt.getTime() !== claimedAt.getTime()) return;
      transaction.set(
        ref,
        { [DEFERRED_READY_EMAIL_FIELD]: deferredAt, esignReadyEmailAt: FieldValue.delete() },
        { merge: true }
      );
    });
  } catch (error) {
    console.error('[esign] failed to restore the held-back ready-to-sign notice', error);
  }
}

/**
 * Sends the "ready to sign" email the invite link held back, once the hire has
 * had DEFERRED_READY_EMAIL_DELAY_MS to sign on the spot and still has
 * something unsigned. Run by the onboarding-nudges cron. Each user is claimed
 * in a transaction that clears the marker, so two overlapping runs (or a
 * portal-triggered notice in between) never send it twice.
 */
export async function sendDeferredEsignReadyEmails(
  now: Date
): Promise<{ sent: number; cleared: number; retrying: number }> {
  const result = { sent: 0, cleared: 0, retrying: 0 };
  if (!adminDb) return result;
  const db = adminDb;

  const cutoff = new Date(now.getTime() - DEFERRED_READY_EMAIL_DELAY_MS);
  const snapshot = await db.collection('users').where(DEFERRED_READY_EMAIL_FIELD, '<=', cutoff).get();

  for (const userDoc of snapshot.docs) {
    const userId = userDoc.id;
    try {
      const fieldRole = userDoc.get('fieldRole') as FieldRole | undefined;
      const stillOnboarding =
        userDoc.get('status') === 'pending' && !!fieldRole && roleRequiresOnboarding(fieldRole);
      const labels = stillOnboarding
        ? await unsignedEsignLabels(userId, fieldRole, !!userDoc.get('isIBO'))
        : [];

      const claimed = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(userDoc.ref);
        const deferredAt = fresh.get(DEFERRED_READY_EMAIL_FIELD);
        if (!deferredAt) return null;
        transaction.set(
          userDoc.ref,
          {
            [DEFERRED_READY_EMAIL_FIELD]: FieldValue.delete(),
            ...(labels.length > 0 ? { esignReadyEmailAt: now } : {}),
          },
          { merge: true }
        );
        return { deferredAt: deferredAt as unknown, to: emailFromUserDoc(fresh) };
      });
      if (!claimed) continue;
      if (labels.length === 0) {
        result.cleared += 1;
        continue;
      }

      // The email goes out first and on its own, because dispatchToUser logs
      // and swallows email failures. A failed send hands the claim back so the
      // next cron run retries it; the bell and push only follow a real send,
      // so a retry never repeats them.
      const name = (userDoc.get('displayName') as string | undefined) ?? 'Rep';
      if (claimed.to) {
        let delivered = false;
        try {
          const outcome = await sendEmail({
            to: claimed.to,
            ...esignSentEmail({
              name,
              docLabels: labels,
              portalUrl: `${appBaseUrl()}/portal/onboarding`,
            }),
            from: onboardingFrom(),
          });
          delivered = outcome.ok;
          if (!outcome.ok) {
            console.error(`[esign] deferred ready-to-sign email to ${userId} failed: ${outcome.error ?? 'unknown'}`);
          }
        } catch (error) {
          console.error(`[esign] deferred ready-to-sign email to ${userId} failed`, error);
        }
        if (!delivered) {
          await releaseDeferredClaim(userDoc.ref, claimed.deferredAt, now);
          result.retrying += 1;
          continue;
        }
      }

      await dispatchToUser({
        userId,
        type: 'system',
        title: 'Documents ready to sign',
        message: `Ready to sign: ${labels.join(', ')}`,
        link: '/portal/onboarding',
      });
      result.sent += 1;
    } catch (error) {
      console.error(`[esign] deferred ready-to-sign notice failed for ${userId}`, error);
    }
  }

  return result;
}
