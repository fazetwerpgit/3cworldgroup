import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createRateLimiter } from '@/lib/rateLimit';

// POST /api/portal/auth/custom-token → { token }
//
// The 3C iOS app's native chat screen signs in to Firebase with
// @react-native-firebase/auth, separately from the WebView. The web posts it a
// custom token for the person already signed in on the web (bridge message
// `nativeAuth`, docs/ios-app/BRIDGE.md).
//
// Identity comes only from the Bearer ID token, checked for revocation; the
// body is never read, so no caller can mint a token for another uid. Only an
// active account gets one (a pending or inactive user doc is refused by the
// shared status gate).

// The web asks once per sign-in and ID-token refresh (about hourly), debounced.
// This only stops a stuck client from looping.
const customTokenLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request, { checkRevoked: true });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminAuth) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    if (!customTokenLimiter.take(gate.uid)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    const token = await adminAuth.createCustomToken(gate.uid);
    return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error creating custom token:', error);
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 });
  }
}
