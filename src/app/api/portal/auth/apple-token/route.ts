import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { storeAppleRefreshToken } from '@/lib/auth/appleSignIn';

const APPLE_PROVIDER_ID = 'apple.com';
const MAX_CODE_LENGTH = 2048;

// POST /api/portal/auth/apple-token { authorizationCode } — right after a Sign
// in with Apple in the 3C iOS app, the web posts Apple's one-time code here.
// The server swaps it for a refresh token and keeps it server-side only, so
// account deletion can revoke it (App Store guideline 5.1.1(v); see
// lib/auth/appleSignIn.ts). The token is verified directly, not through
// requireVerifiedUser: a brand-new self-signup is pending with no role, and its
// Apple access must still be revocable if it withdraws.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb || !adminAuth) {
      return NextResponse.json({ error: 'Firebase Admin is not configured' }, { status: 500 });
    }
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
    let uid: string;
    try {
      uid = (await adminAuth.verifyIdToken(token, true)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const raw = (body as { authorizationCode?: unknown } | null)?.authorizationCode;
    const code = typeof raw === 'string' ? raw.trim() : '';
    if (!code || code.length > MAX_CODE_LENGTH) {
      return NextResponse.json({ error: 'authorizationCode is required' }, { status: 400 });
    }

    // Only an account that actually signs in with Apple gets a stored token.
    const authUser = await adminAuth.getUser(uid);
    if (!authUser.providerData.some((info) => info.providerId === APPLE_PROVIDER_ID)) {
      return NextResponse.json({ error: 'This account does not use Sign in with Apple' }, { status: 409 });
    }

    // A Sign in with Apple that matched no portal account is rejected and its
    // Auth user deleted (/api/portal/auth/unlinked-social): keep no token for it.
    if (!(await adminDb.doc(`users/${uid}`).get()).exists) {
      return NextResponse.json({ error: 'No portal account for this sign-in' }, { status: 404 });
    }

    const result = await storeAppleRefreshToken(adminDb, uid, code);
    if (result.status === 'stored') return NextResponse.json({ stored: true });
    if (result.status === 'not_configured') return NextResponse.json({ stored: false, reason: 'not_configured' });
    return NextResponse.json({ stored: false, reason: 'exchange_failed' }, { status: 502 });
  } catch (error) {
    console.error('[auth/apple-token] failed', error);
    return NextResponse.json({ error: 'Failed to store Apple sign-in' }, { status: 500 });
  }
}
