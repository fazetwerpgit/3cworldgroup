import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { NATIVE_PUSH_PLATFORM, nativeTokenEntry } from '@/lib/push/pushTargets';
import { claimPushToken } from '@/lib/push/claimPushToken';

// POST   /api/portal/push/register  { token, platform? }  → add this device's FCM token to the user
//                                                         (and remove it from any other user)
// DELETE /api/portal/push/register  { token, platform? }  → remove it (opt-out / sign-out)
// Web (browser / PWA) tokens — no platform — are stored on users/{uid}.pushTokens[].
// The 3C iOS app sends platform: 'ios-native'; those are stored platform-tagged
// on users/{uid}.nativePushTokens[] as { token, platform } and get an APNs
// notification payload (see lib/push/sendPush.ts).

type Platform = 'web' | typeof NATIVE_PUSH_PLATFORM;

function readPlatform(body: { platform?: unknown }): Platform | null {
  if (body.platform === undefined || body.platform === null || body.platform === 'web') return 'web';
  if (body.platform === NATIVE_PUSH_PLATFORM) return NATIVE_PUSH_PLATFORM;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // A hired rep mid-onboarding needs push, or they miss the "your onboarding
    // item was rejected" notification. The shared API allowlist covers this.
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
    const platform = readPlatform(body);
    if (!platform) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });

    // Also takes the token off any other account that still holds it (a phone
    // that switched users without a clean sign-out), so pushes follow the
    // signed-in rep only.
    const { removedFrom } = await claimPushToken(adminDb, gate.uid, token, platform);
    if (removedFrom.length) {
      console.info(`[push/register] moved a ${platform} token from ${removedFrom.length} other account(s) to ${gate.uid}`);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering push token:', error);
    return NextResponse.json({ error: 'Failed to register push token' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Mirrors POST: a rep who could register a token must be able to remove it.
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
    const platform = readPlatform(body);
    if (!platform) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });

    await adminDb.collection('users').doc(gate.uid).set(
      platform === NATIVE_PUSH_PLATFORM
        ? { nativePushTokens: FieldValue.arrayRemove(nativeTokenEntry(token)) }
        : { pushTokens: FieldValue.arrayRemove(token) },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing push token:', error);
    return NextResponse.json({ error: 'Failed to remove push token' }, { status: 500 });
  }
}
