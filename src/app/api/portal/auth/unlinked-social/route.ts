import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rejectUnlinkedSocialSignIn } from '@/lib/auth/unlinkedSocialSignIn';

// POST /api/portal/auth/unlinked-social — called by AuthContext when a Sign in
// with Apple / Google resolved to a Firebase Auth user with no portal profile.
// Such a sign-in never creates an account (new reps sign up with the team
// code); this deletes the Auth user that sign-in just created, under the
// guards in lib/auth/unlinkedSocialSignIn.ts. The uid comes from the caller's
// own ID token, so an account can only ever remove itself. No owner alert.
export async function POST(request: Request) {
  if (!adminAuth || !adminDb) {
    console.error('[auth/unlinked-social] Firebase Admin is not configured');
    return NextResponse.json({ error: 'Firebase Admin is not configured' }, { status: 500 });
  }
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });

  let uid: string;
  let signInProvider: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    signInProvider = decoded.firebase?.sign_in_provider;
  } catch {
    return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
  }

  try {
    const result = await rejectUnlinkedSocialSignIn({ auth: adminAuth, db: adminDb }, uid, signInProvider);
    if (result.status === 'deleted') return NextResponse.json({ deleted: true });
    if (result.status === 'kept') console.warn('[auth/unlinked-social] kept Auth user', uid, result.reason);
    return NextResponse.json({ deleted: false, reason: result.status === 'kept' ? result.reason : 'has_profile' });
  } catch (error) {
    console.error('[auth/unlinked-social] failed', uid, error);
    return NextResponse.json({ error: 'Failed to clean up the sign-in' }, { status: 500 });
  }
}
