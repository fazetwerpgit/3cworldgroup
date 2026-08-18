import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { createAlertTask, resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { appBaseUrl, esignSentEmail } from '@/lib/email/templates';
import { onboardingFrom } from '@/lib/email/sendEmail';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import { isEsignItem } from '@/lib/onboarding/esign';
import type { FieldRole } from '@/types/auth';
import { getEsignProvider } from './provider';
import type { EsignDocKey, EsignProvider } from './provider';

const MIN_RETRY_INTERVAL_MS = 5 * 60 * 1000;
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

// The embedded signing URL is a bearer capability and never lives in
// userOnboarding (client-readable via firestore.rules). It is stored
// server-only in esignSigningUrls/{userId}_{itemId}, a collection with no
// firestore.rules match — the Admin SDK can read/write it, the client SDK
// cannot read it under any role.
async function persistSigningUrl(
  userId: string,
  itemId: string,
  envelopeId: string,
  url: string
): Promise<boolean> {
  const ref = adminDb!.doc(`esignSigningUrls/${userId}_${itemId}`);
  const data = { userId, itemId, envelopeId, url, updatedAt: new Date() };
  try {
    await ref.set(data, { merge: true });
    return true;
  } catch (firstError) {
    try {
      await ref.set(data, { merge: true });
      return true;
    } catch (error) {
      console.error(`[esign] embedded signing url failed to persist for ${userId}/${itemId}`, {
        envelopeId,
        error,
        firstError,
      });
      return false;
    }
  }
}

// The envelope was created (webhook will still fire and must find a record to
// update), but there is no usable in-portal signing link for the candidate —
// either the provider never returned one, or persisting it failed after
// retry. This is never a silent dead end: the item's dispatch state is marked
// failed (surfaces the honest "we hit a snag" copy on the board) and ops is
// alerted immediately, not after three attempts.
async function recordMissingSigningUrl(
  pending: PendingItem,
  userId: string,
  signerName: string,
  envelopeId: string,
  lastError: string
): Promise<void> {
  const now = new Date();
  const state = dispatchState(pending.snap);
  const attempts = previousAttempts(state) + 1;
  const persistence = {
    userId,
    itemId: pending.item.id,
    status: 'submitted',
    reference: `esign:${envelopeId}`,
    esignEnvelopeId: envelopeId,
    esignDispatch: {
      state: 'failed',
      attempts,
      lastError,
      lastAttemptAt: now,
    },
    submittedAt: now,
    updatedAt: now,
  };

  try {
    await pending.ref.set(persistence, { merge: true });
  } catch (firstError) {
    try {
      await pending.ref.set(persistence, { merge: true });
    } catch (error) {
      console.error(
        `[esign] envelope was created but its record failed to persist for ${userId}/${pending.item.id}`,
        { envelopeId, userId, itemId: pending.item.id, error, firstError }
      );
    }
  }

  try {
    await createAlertTask({
      kind: ALERT_KIND,
      subjectUserId: userId,
      subjectName: signerName,
      title: 'E-signature signing link missing',
      message: `${signerName} has a document (${pending.item.label}) ready to sign, but no in-portal signing link was available.`,
      link: '/portal/admin/onboarding',
    });
  } catch (error) {
    console.error(`[esign] failed to raise missing-signing-url alert for ${userId}/${pending.item.id}`, error);
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
    return snapshot.docs.some((doc) => dispatchState(doc).state === 'failed');
  } catch (error) {
    console.error(`[esign] failed to inspect dispatch failures for ${userId}`, error);
    return true;
  }
}

async function sendOne(
  provider: EsignProvider,
  pending: PendingItem,
  userId: string,
  signerName: string,
  signerEmail: string
): Promise<{ sent: boolean; recovered?: boolean; failed?: { previousAttempts: number; attempts: number } }> {
  let envelopeId: string;
  let embeddedSigningUrl: string | undefined;
  try {
    ({ envelopeId, embeddedSigningUrl } = await provider.createEnvelope({
      docKey: pending.item.id as EsignDocKey,
      userId,
      itemId: pending.item.id,
      signerName,
      signerEmail,
    }));
  } catch (error) {
    console.error(`[esign] envelope creation failed for ${userId}/${pending.item.id}`, error);
    return { sent: false, failed: (await recordFailure(pending, userId, error)) ?? undefined };
  }

  if (!embeddedSigningUrl) {
    await recordMissingSigningUrl(pending, userId, signerName, envelopeId, 'missing_signing_url');
    return { sent: false };
  }

  const urlPersisted = await persistSigningUrl(userId, pending.item.id, envelopeId, embeddedSigningUrl);
  if (!urlPersisted) {
    await recordMissingSigningUrl(pending, userId, signerName, envelopeId, 'signing_url_persist_failed');
    return { sent: false };
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

/**
 * Creates or retries e-sign envelopes for applicable items. This function is
 * deliberately failure-contained: callers receive whatever was sent, while
 * provider and persistence failures are recorded/logged and never re-thrown.
 */
export async function sendPendingEsignDocs(userId: string): Promise<string[]> {
  if (!adminDb) return [];

  const sent: string[] = [];
  try {
    const userSnap = await adminDb.doc(`users/${userId}`).get();
    if (!userSnap.exists) return sent;

    const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
    if (!fieldRole) return sent;

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
        if (snap.get('esignEnvelopeId')) continue;
        if (!['not_started', 'submitted', 'rejected'].includes(status)) continue;
        if (isThrottled(state, now)) continue;
        pending.push({ item, ref, snap });
      } catch (error) {
        console.error(`[esign] failed to inspect ${userId}/${item.id}`, error);
      }
    }

    if (pending.length === 0) return sent;

    let provider: EsignProvider;
    try {
      provider = getEsignProvider();
    } catch (error) {
      console.error(`[esign] provider construction failed for ${userId}`, error);
      let alertRaised = false;
      for (const item of pending) {
        const failure = await recordFailure(item, userId, error);
        if (!alertRaised && failure && failure.attempts >= 3) {
          alertRaised = true;
          await raiseDispatchAlert(userId, signerName);
        }
      }
      return sent;
    }

    let alertRaised = false;
    let recovered = false;
    const sentLabels: string[] = [];
    for (const item of pending) {
      const result = await sendOne(provider, item, userId, signerName, signerEmail);
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

    if (sentLabels.length > 0) {
      try {
        await dispatchToUser({
          userId,
          type: 'system',
          title: 'Documents sent for signature',
          message: `Ready to sign: ${sentLabels.join(', ')}`,
          link: '/portal/onboarding',
          email: esignSentEmail({
            name: signerName,
            docLabels: sentLabels,
            portalUrl: `${appBaseUrl()}/portal/onboarding`,
          }),
          emailFrom: onboardingFrom(),
        });
      } catch (error) {
        console.error(`[esign] failed to notify ${userId} about sent documents`, error);
      }
    }
  } catch (error) {
    console.error(`[esign] pending document send failed for ${userId}`, error);
  }

  return sent;
}
