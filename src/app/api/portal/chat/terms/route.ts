import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';

// The one-time team chat agreement (App Store guideline 1.2): no tolerance for
// objectionable content or abusive users. Accepting stamps
// users/{uid}.chatTermsAcceptedAt once; it is never cleared from here.

function isoOf(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

// GET — { acceptedAt: ISO string | null } for the caller.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const snap = await adminDb.collection('users').doc(result.user.uid).get();
    return NextResponse.json({ acceptedAt: isoOf(snap.data()?.chatTermsAcceptedAt) });
  } catch (error) {
    console.error('Error reading chat terms:', error);
    return NextResponse.json({ error: 'Failed to load chat terms' }, { status: 500 });
  }
}

// POST — accept. A repeat keeps the first acceptance time.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const userRef = adminDb.collection('users').doc(result.user.uid);
    const acceptedAt = await adminDb.runTransaction(async (tx) => {
      const existing = (await tx.get(userRef)).data()?.chatTermsAcceptedAt;
      if (existing instanceof Timestamp) return existing;
      const now = Timestamp.now();
      tx.set(userRef, { chatTermsAcceptedAt: now }, { merge: true });
      return now;
    });
    return NextResponse.json({ success: true, acceptedAt: acceptedAt.toDate().toISOString() });
  } catch (error) {
    console.error('Error accepting chat terms:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
