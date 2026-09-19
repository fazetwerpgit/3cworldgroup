import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getOnboardingItemsForUser, resolveRoles } from '@/types';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { isEsignItem } from '@/lib/onboarding/esign';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';

// POST /api/portal/onboarding/esign-send - Send or resend one e-sign item.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = (await request.json()) as { userId?: unknown; itemId?: unknown };
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    if (!userId || !itemId) {
      return NextResponse.json({ error: 'Missing required fields: userId, itemId' }, { status: 400 });
    }
    if (!isEsignItem(itemId)) {
      return NextResponse.json({ error: 'Item is not an e-sign item' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data() ?? {};
    const { fieldRole } = resolveRoles(userData.role, userData.fieldRole);
    if (!fieldRole || !getOnboardingItemsForUser(fieldRole, userData.isIBO ?? false).some((item) => item.id === itemId)) {
      return NextResponse.json({ error: 'This item does not apply to the user onboarding checklist' }, { status: 400 });
    }

    const itemRef = adminDb.collection('userOnboarding').doc(`${userId}_${itemId}`);
    const itemDoc = await itemRef.get();
    const envelopeId = itemDoc.get('esignEnvelopeId') as string | undefined;
    if (envelopeId) {
      return NextResponse.json({ sent: false, reason: 'envelope_exists', envelopeId });
    }

    await itemRef.set({
      reference: FieldValue.delete(),
      status: 'not_started',
      updatedAt: new Date(),
    }, { merge: true });
    const sentItems = await sendPendingEsignDocs(userId);
    return NextResponse.json({ sent: sentItems.includes(itemId), sent_items: sentItems });
  } catch (error) {
    console.error('Error sending onboarding e-sign item:', error);
    return NextResponse.json({ error: 'Failed to send onboarding e-sign item' }, { status: 500 });
  }
}
