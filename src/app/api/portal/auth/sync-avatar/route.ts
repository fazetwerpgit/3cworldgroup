import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

// POST /api/portal/auth/sync-avatar — verified caller only. Copies the caller's
// OWN Firebase Auth photoURL (set by Google SSO) onto their OWN users doc's
// avatarUrl field, if missing or stale. Both the target uid and the photo come
// from the verified token / adminAuth record — never from client input — so
// this can only ever touch the caller's own doc. Fail-soft by design: any
// caller (client-side, best-effort) should treat a non-200 as a no-op, never
// as a login blocker.
// Only Google-hosted photos are legitimate here (Google SSO is the only flow
// that sets photoURL). Any authenticated user can point their Auth photoURL at
// an arbitrary host via the client SDK; without this allowlist that URL would
// be propagated and loaded by every chat member's browser (tracking-pixel /
// offensive-image vector).
function isAllowedAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'googleusercontent.com' ||
        parsed.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    }

    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    // Read the live Auth record rather than trusting the token's `picture` claim,
    // which can be stale if the token was minted before a photo change.
    const authRecord = await adminAuth.getUser(uid);
    const photoURL = typeof authRecord.photoURL === 'string' ? authRecord.photoURL : '';
    if (!photoURL || !isAllowedAvatarUrl(photoURL)) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ success: true, skipped: true });
    }
    const existing = snap.data() ?? {};
    if (existing.avatarUrl === photoURL) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Merge write touching ONLY avatarUrl — nothing else on the caller's doc changes.
    await userRef.set({ avatarUrl: photoURL }, { merge: true });

    return NextResponse.json({ success: true, avatarUrl: photoURL });
  } catch (error) {
    console.error('Error syncing avatar from Auth photoURL:', error);
    // Fail-soft: the caller ignores non-200s, so this never affects login.
    return NextResponse.json({ error: 'Failed to sync avatar' }, { status: 500 });
  }
}
