import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getEsignProvider } from '@/lib/esign/provider';
import { createNotification } from '@/lib/notifications/createNotification';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { ONBOARDING_ITEMS } from '@/types/onboarding';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';
import { isEsignItem } from '@/lib/onboarding/esign';

const ALERT_KIND = 'esign_mismatch' as const;

export async function POST(request: Request) {
  const raw = await request.text();
  const event = await getEsignProvider().parseWebhook(raw, request.headers);
  if (!event) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  if (event.status !== 'completed') return NextResponse.json({ ok: true });

  if (!adminDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { userId, itemId } = event.metadata;
  if (!userId || !itemId) {
    console.error('[esign webhook] completed event missing metadata', event.envelopeId);
    return NextResponse.json({ ok: true });
  }

  const item = ONBOARDING_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) {
    console.error('[esign webhook] completed event has unknown itemId', {
      envelopeId: event.envelopeId,
      itemId,
    });
    return NextResponse.json({ ok: true });
  }
  if (!isEsignItem(itemId)) {
    console.error('[esign webhook] completed event is not an e-sign item', {
      envelopeId: event.envelopeId,
      itemId,
    });
    return NextResponse.json({ ok: true });
  }

  const onboardingRef = adminDb.doc(`userOnboarding/${userId}_${itemId}`);
  const onboardingSnap = await onboardingRef.get();
  const currentEnvelopeId = onboardingSnap.get('esignEnvelopeId') as string | undefined;
  if (event.envelopeId !== currentEnvelopeId) {
    const supersededEnvelopeIds = onboardingSnap.get('supersededEnvelopeIds');
    const isSuperseded =
      Array.isArray(supersededEnvelopeIds) && supersededEnvelopeIds.includes(event.envelopeId);
    if (isSuperseded) {
      console.warn('[esign webhook] superseded envelope ignored', {
        userId,
        itemId,
        eventEnvelopeId: event.envelopeId,
        currentEnvelopeId: currentEnvelopeId ?? null,
      });
    } else {
      console.error('[esign webhook] unknown envelope mismatch', {
        userId,
        itemId,
        eventEnvelopeId: event.envelopeId,
        currentEnvelopeId: currentEnvelopeId ?? null,
      });
      // Ops reads this task in a queue of people, so resolve a real name — but
      // never at the cost of the alert itself, so this is its own try and the
      // uid is an acceptable fallback.
      let subjectName = userId;
      try {
        const userSnap = await adminDb.doc(`users/${userId}`).get();
        subjectName =
          (userSnap.get('displayName') as string | undefined) ||
          (userSnap.get('email') as string | undefined) ||
          userId;
      } catch (error) {
        console.error('[esign webhook] failed to resolve rep name for alert', { userId, error });
      }
      try {
        await createAlertTask({
          kind: ALERT_KIND,
          subjectUserId: userId,
          subjectName,
          title: 'E-signature identity mismatch needs attention',
          message: `A completed e-signature event for ${item.label} did not match the envelope recorded for this rep. Reconcile the provider envelope ${event.envelopeId} before activation.`,
          link: '/portal/admin/onboarding',
        });
      } catch (error) {
        console.error('[esign webhook] failed to raise envelope mismatch alert', {
          userId,
          itemId,
          error,
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  const now = new Date();
  await onboardingRef.set(
    {
      userId,
      itemId,
      status: 'approved',
      rejectionReason: null,
      reviewedBy: 'system',
      reviewerName: 'E-sign (auto)',
      reviewedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await createNotification({
    userId,
    type: 'esign_completed',
    title: 'Document signed',
    message: `${item.label} is complete.`,
    link: '/portal/onboarding',
  });
  try {
    await maybeFlagActivationReady(userId);
  } catch (error) {
    console.error('[esign webhook] failed to flag activation readiness', error);
  }

  return NextResponse.json({ ok: true });
}
