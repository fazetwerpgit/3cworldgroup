import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  ONBOARDING_ITEMS,
  resolveRoles,
  getOnboardingItemsForUser,
  looksLikeRawSensitiveData,
} from '@/types';
import { requireSelfOrManagement } from '@/lib/auth/requireManagement';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { verifyStorageReference } from '@/lib/onboarding/verifyStorageReference';

// POST /api/portal/onboarding/submit - Rep submits an onboarding item for review.
// Sensitive items (W-9, direct deposit, chargeback card) accept a reference
// string only (storage path or vendor ref) - raw card numbers / SSNs are
// never persisted. Doc id: userId_itemId in `userOnboarding`.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, itemId, reference } = body;

    if (!userId || !itemId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, itemId' },
        { status: 400 }
      );
    }

    // A user may submit their own onboarding; management may submit on behalf.
    const gate = await requireSelfOrManagement(body.requestedBy, userId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const item = ONBOARDING_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      return NextResponse.json(
        { error: 'Unknown onboarding item' },
        { status: 400 }
      );
    }

    // Sensitive items must carry a reference/vendor token, never raw PII.
    if (
      item.sensitive &&
      typeof reference === 'string' &&
      looksLikeRawSensitiveData(reference)
    ) {
      return NextResponse.json(
        {
          error:
            'This looks like a raw card/SSN/account number. Enter a reference or vendor token only - never raw sensitive data.',
        },
        { status: 400 }
      );
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const { fieldRole } = resolveRoles(userData?.role, userData?.fieldRole);
    if (!fieldRole) {
      return NextResponse.json(
        { error: 'Onboarding applies to field sales users only' },
        { status: 400 }
      );
    }

    // Reject items that don't apply to this user (e.g. IBO-only items for non-IBO)
    const applicable = getOnboardingItemsForUser(fieldRole, userData?.isIBO ?? false);
    if (!applicable.some((i) => i.id === itemId)) {
      return NextResponse.json(
        { error: 'This item does not apply to your onboarding checklist' },
        { status: 400 }
      );
    }

    // Storage items: the reference must be this user's own folder and the
    // required file(s) must actually exist. Prevents pointing a submission at
    // another user's folder, and blocks empty/partial submissions.
    if (isStorageItem(itemId)) {
      const verified = await verifyStorageReference(
        { kind: 'user', userId },
        itemId,
        typeof reference === 'string' ? reference : ''
      );
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }
    }

    const docRef = adminDb.collection('userOnboarding').doc(`${userId}_${itemId}`);
    const existing = await docRef.get();
    const currentStatus = existing.exists ? existing.data()?.status : 'not_started';

    // Only not_started or rejected items can be (re)submitted
    if (currentStatus === 'submitted' || currentStatus === 'approved') {
      return NextResponse.json(
        { error: `Item is already ${currentStatus === 'submitted' ? 'under review' : 'approved'}` },
        { status: 400 }
      );
    }

    const now = new Date();
    await docRef.set(
      {
        userId,
        itemId,
        status: 'submitted',
        // Reference only - never raw sensitive data
        reference: typeof reference === 'string' ? reference.trim().slice(0, 500) : '',
        rejectionReason: null,
        submittedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: `${item.label} submitted for review`,
    });
  } catch (error) {
    console.error('Error submitting onboarding item:', error);
    return NextResponse.json(
      { error: 'Failed to submit onboarding item' },
      { status: 500 }
    );
  }
}
