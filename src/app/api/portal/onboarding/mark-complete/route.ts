import { after, NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';
import {
  MANUAL_NOTE_MAX,
  MANUAL_NOTE_MIN,
  normalizeManualNote,
  type ManualCompletion,
} from '@/lib/onboarding/manualCompletion';

// POST /api/portal/onboarding/mark-complete - An owner marks one of a rep's
// onboarding items complete, whatever its current status, with a required note
// (e.g. the contract was signed on paper). Admin and operations cannot: this
// skips the review and e-signature entirely.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Gate before reading the body. The owner stamped on the item is whoever
    // holds the token, never a uid the client names.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (!gate.isOwner) {
      return NextResponse.json({ error: 'Only an owner can mark items complete' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    // userId is the TARGET rep whose item is being completed - data, not identity.
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
    if (!userId || !itemId) {
      return NextResponse.json({ error: 'Missing required fields: userId, itemId' }, { status: 400 });
    }

    const note = normalizeManualNote(body?.note);
    if (!note) {
      return NextResponse.json(
        { error: `Add a note of ${MANUAL_NOTE_MIN} to ${MANUAL_NOTE_MAX} characters` },
        { status: 400 }
      );
    }

    const item = ONBOARDING_ITEMS.find((candidate) => candidate.id === itemId);
    if (!item) {
      return NextResponse.json({ error: 'Unknown onboarding item' }, { status: 400 });
    }

    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const docRef = adminDb.collection('userOnboarding').doc(`${userId}_${itemId}`);
    const doc = await docRef.get();
    if (doc.exists && doc.get('status') === 'approved') {
      return NextResponse.json({ success: true, alreadyComplete: true });
    }

    const now = new Date();
    const manualCompletion: ManualCompletion = { note, by: gate.uid, byName: gate.name, at: now };
    // Envelope fields stay as the record of what was sent; an approved item
    // never links to its envelope again.
    await docRef.set(
      {
        userId,
        itemId,
        status: 'approved',
        rejectionReason: null,
        reviewedBy: gate.uid,
        reviewerName: gate.name,
        reviewedAt: now,
        updatedAt: now,
        manualCompletion,
      },
      { merge: true }
    );

    after(() =>
      maybeFlagActivationReady(userId).catch((error) => {
        console.error('Failed to flag activation readiness after manual completion:', error);
      })
    );

    return NextResponse.json({ success: true, message: `${item.label} marked complete` });
  } catch (error) {
    console.error('Error marking onboarding item complete:', error);
    return NextResponse.json({ error: 'Failed to mark item complete' }, { status: 500 });
  }
}
