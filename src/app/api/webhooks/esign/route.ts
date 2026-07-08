import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getEsignProvider } from '@/lib/esign/provider';
import { createNotification } from '@/lib/notifications/createNotification';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

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

  const now = new Date();
  await adminDb.doc(`userOnboarding/${userId}_${itemId}`).set(
    {
      userId,
      itemId,
      status: 'approved',
      reviewedBy: 'system',
      reviewerName: 'E-sign (auto)',
      reviewedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const label = ONBOARDING_ITEMS.find((item) => item.id === itemId)?.label ?? itemId;
  await createNotification({
    userId,
    type: 'esign_completed',
    title: 'Document signed',
    message: `${label} is complete.`,
    link: '/portal/onboarding',
  });

  return NextResponse.json({ ok: true });
}
