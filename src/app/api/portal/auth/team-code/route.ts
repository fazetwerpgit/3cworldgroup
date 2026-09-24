import { NextResponse } from 'next/server';
import { isValidTeamCode } from '@/lib/auth/teamCode';
import { getInviteByToken, inviteSignupState } from '@/lib/recruiting/inviteLookup';

let warnedUnconfigured = false;

// Invite tokens are 32 random bytes, base64url (43 chars). Anything far off
// that shape is not a token, so it never reaches Firestore.
const INVITE_TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * POST { code } -> { ok }
 * POST { inviteToken } -> { ok: true, state: 'open' | 'submitted' } | { ok: false }
 *
 * Verifies the shared signup team code against PORTAL_TEAM_CODE, or stands in
 * for it with a 3C invite: an invited hire never needs the code. 'open' means
 * the packet at /onboard/<token> can still be filled in; 'submitted' means the
 * hire already has an account from it. Unknown, expired and closed invites
 * all answer the same { ok: false }. The team code itself is never returned.
 * Always responds 200 so the client can branch on `ok` alone, mirroring
 * /api/portal/auth/captcha. The code check fails closed when the env var is
 * missing.
 */
export async function POST(request: Request) {
  let body: { code?: unknown; inviteToken?: unknown };
  try {
    body = (await request.json()) as { code?: unknown; inviteToken?: unknown };
  } catch {
    return NextResponse.json({ ok: false });
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false });

  if (body.inviteToken !== undefined) {
    try {
      if (typeof body.inviteToken !== 'string' || !INVITE_TOKEN_SHAPE.test(body.inviteToken)) {
        return NextResponse.json({ ok: false });
      }
      const invite = await getInviteByToken(body.inviteToken);
      const state = invite ? inviteSignupState(invite.data) : null;
      return NextResponse.json(state ? { ok: true, state } : { ok: false });
    } catch (error) {
      console.error('Error checking signup invite token:', error);
      return NextResponse.json({ ok: false });
    }
  }

  const expected = process.env.PORTAL_TEAM_CODE;
  if (!expected || !expected.trim()) {
    if (!warnedUnconfigured) {
      console.warn('PORTAL_TEAM_CODE is unset; portal self-signup is blocked until it is configured.');
      warnedUnconfigured = true;
    }
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: isValidTeamCode(body.code, expected) });
}
