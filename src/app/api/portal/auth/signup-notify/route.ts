import { NextResponse } from 'next/server';
import { isDisplayNameTaken } from '@/lib/users/displayNameTaken';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { looksLikeBotSignup } from '@/lib/auth/botDetection';
import { verifyCaptchaPass } from '@/lib/auth/captchaPass';
import { isValidTeamCode, signupNotifyLimiter } from '@/lib/auth/teamCode';
import { clientIp } from '@/lib/rateLimit';
import { getInviteByToken, inviteSignupState } from '@/lib/recruiting/inviteLookup';

const INVITE_TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

type GateBody = { code?: unknown; inviteToken?: unknown; captchaPass?: unknown } | null;

/**
 * The signup form's reCAPTCHA, enforced here: the pass /api/portal/auth/captcha
 * issued for this account's email. Without a secret, production fails closed
 * (like the captcha route) and local dev and tests skip the check.
 */
function passesCaptcha(body: GateBody, email: string | undefined): boolean {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return verifyCaptchaPass(body?.captchaPass, email, secret);
}

/** A password signup passes the gate with the team code or an open 3C invite. */
async function passesSignupGate(body: GateBody): Promise<boolean> {
  if (isValidTeamCode(body?.code, process.env.PORTAL_TEAM_CODE)) return true;
  const token = body?.inviteToken;
  if (typeof token !== 'string' || !INVITE_TOKEN_SHAPE.test(token)) return false;
  try {
    const invite = await getInviteByToken(token);
    return invite ? inviteSignupState(invite.data) === 'open' : false;
  } catch (error) {
    console.error('[signup-notify] Invite check failed:', error);
    return false;
  }
}

// Called right after a self-signup writes its pending users doc, by
// AuthContext.signUp with the team code in the body. The uid comes from the caller's ID
// token, so only the new account itself can raise its owner alert. A pending
// caller is expected here, so this verifies the token directly instead of
// using the requireVerified* gates. Accounts made straight through the public
// Firebase API have no code, so they raise no alert.
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
  let tokenEmail: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    signInProvider = decoded.firebase?.sign_in_provider;
    tokenEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
  }

  // Every self-signup is a password signup carrying the team code (or its
  // open 3C invite token) and the captcha pass for its email: the client form
  // checks both first, but the server is the gate. Sign in with Apple / Google
  // never creates an account (AuthContext rejects a social sign-in with no
  // profile; see /api/portal/auth/unlinked-social), so a social token here
  // is refused outright. A password signup that fails is flagged
  // suspectedBot, which keeps it out of the admin pending queue and raises no
  // alert, so skipping the form's check gets nowhere.
  if (signInProvider !== 'password') {
    return NextResponse.json({ error: 'Sign up with your email and team code' }, { status: 403 });
  }
  {
    let body: GateBody;
    try {
      body = (await request.json()) as GateBody;
    } catch {
      body = null;
    }
    if (!passesCaptcha(body, tokenEmail) || !(await passesSignupGate(body))) {
      try {
        const snap = await adminDb.doc(`users/${uid}`).get();
        if (snap.exists && snap.get('status') === 'pending' && !snap.get('fieldRole')) {
          await adminDb.doc(`users/${uid}`).update({ suspectedBot: true, signupGateFailed: true, updatedAt: new Date() });
        }
      } catch (error) {
        console.error('[signup-notify] Failed to flag ungated signup:', error);
      }
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
    // The client writes the signup doc itself, so an exact copy of another
    // user's name can't be refused there: the admin is told, and approval
    // refuses it until the name is changed (lib/users/displayNameTaken).
    const nameTaken = await isDisplayNameTaken(adminDb, displayName, uid).catch(() => false);
    await createAlertTask({
      kind: 'pending_assignment',
      subjectUserId: uid,
      subjectName: name,
      title: `${name} self-registered and needs a position`,
      message: nameTaken
        ? "Assign their role to start onboarding. Their name matches another user's exactly: change it before approving."
        : 'Assign their role to start onboarding.',
      link: '/portal/admin/people?tab=everyone',
    });
  } catch (error) {
    console.error('[signup-notify] Failed to notify pending signup:', error);
  }

  return NextResponse.json({ ok: true });
}
