import { NextResponse } from 'next/server';
import { isValidTeamCode } from '@/lib/auth/teamCode';

let warnedUnconfigured = false;

/**
 * POST { code } -> { ok }
 *
 * Verifies the shared signup team code against PORTAL_TEAM_CODE. Always
 * responds 200 so the client can branch on `ok` alone, mirroring
 * /api/portal/auth/captcha. Fails closed when the env var is missing.
 */
export async function POST(request: Request) {
  const expected = process.env.PORTAL_TEAM_CODE;
  if (!expected || !expected.trim()) {
    if (!warnedUnconfigured) {
      console.warn('PORTAL_TEAM_CODE is unset; portal self-signup is blocked until it is configured.');
      warnedUnconfigured = true;
    }
    return NextResponse.json({ ok: false });
  }

  try {
    const body = await request.json() as { code?: unknown };
    return NextResponse.json({ ok: isValidTeamCode(body.code, expected) });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
