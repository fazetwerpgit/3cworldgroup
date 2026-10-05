import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { looksLikeBotSignup } from '@/lib/auth/botDetection';
import { isValidTeamCode, signupNotifyLimiter } from '@/lib/auth/teamCode';
import { clientIp } from '@/lib/rateLimit';

// Called right after a self-signup writes its pending users doc: by
// AuthContext.signUp with the team code in the body, and by the Google
// first-sign-in bootstrap with no body. The uid comes from the caller's ID
// token, so only the new account itself can raise its owner alert. A pending
// caller is expected here, so this verifies the token directly instead of
// using the requireVerified* gates. Accounts made straight through the public
// Firebase API have neither the code nor a Google sign-in, so they raise no alert.
export async function POST(request: Request) {
  if (!signupNotifyLimiter.take(clientIp(request))) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  if (!adminAuth || !adminDb) {
    console.error('[signup-notify] Auth not configured');
    return NextResponse.json({ ok: true });
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

  if (signInProvider !== 'google.com') {
    let code: unknown;
    try {
      code = ((await request.json()) as { code?: unknown } | null)?.code;
    } catch {
      code = undefined;
    }
    if (!isValidTeamCode(code, process.env.PORTAL_TEAM_CODE)) {
      return NextResponse.json({ error: 'A valid team code is required' }, { status: 403 });
    }
  }

  try {
    const snap = await adminDb.doc(`users/${uid}`).get();
    if (!snap.exists || snap.get('status') !== 'pending' || snap.get('fieldRole')) {
      return NextResponse.json({ ok: true });
    }

    const email = (snap.get('email') as string | undefined) ?? '';
    const displayName = (snap.get('displayName') as string | undefined) ?? '';
    if (looksLikeBotSignup(email, displayName)) {
      await adminDb.doc(`users/${uid}`).update({ suspectedBot: true, updatedAt: new Date() });
      return NextResponse.json({ ok: true });
    }

    const name = displayName || email || uid;
    await createAlertTask({
      kind: 'pending_assignment',
      subjectUserId: uid,
      subjectName: name,
      title: `${name} self-registered and needs a position`,
      message: 'Assign their role to start onboarding.',
      link: '/portal/admin/people?tab=everyone',
    });
  } catch (error) {
    console.error('[signup-notify] Failed to notify pending signup:', error);
  }

  return NextResponse.json({ ok: true });
}
