import { NextRequest, NextResponse } from 'next/server';
import { consumeState, isConsultant, saveConnection, type ConnectFrom, type ConnectReturn } from '@/lib/solar/google/connection';
import { SCOPE_EVENTS, exchangeCode, googleClient, revokeToken } from '@/lib/solar/google/oauth';
import type { ConnectError } from '@/lib/solar/google/status';

// The only pages a web sign-in returns to: a fixed path per name, so the
// stored state can never send the browser anywhere else.
const RETURN_PATHS: Record<ConnectReturn, string> = {
  setup: '/portal/admin/solar?tab=setup&',
  availability: '/portal/solar/availability?',
};

// Where the browser lands. Web: back on the page that started it (Setup or My
// availability), which shows a banner. App: the flow finished in the app's
// browser sheet (Google refuses sign-in inside the app's WebView), so a small
// page there says to go back to the app (`back=availability` tells it which
// page to forward to if it is opened inside the app). Unknown (a bad state):
// that same small page.
function landing(
  request: NextRequest,
  from: ConnectFrom | null,
  returnTo: ConnectReturn,
  outcome: { ok: true; freeBusy: boolean } | { ok: false; reason: ConnectError }) {
  const params = new URLSearchParams();
  if (outcome.ok) {
    params.set('google', 'connected');
    if (!outcome.freeBusy) params.set('freebusy', 'off');
  } else {
    params.set('google', 'error');
    params.set('reason', outcome.reason);
  }
  if (from !== 'web' && returnTo === 'availability') params.set('back', 'availability');
  const path = from === 'web' ? `${RETURN_PATHS[returnTo]}${params}` : `/portal/google-calendar?${params}`;
  const res = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  // The callback URL carries Google's one-time code: never send it on as a referrer, never cache.
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// GET /api/portal/solar/google/callback?code&state[&error] (Google redirects
// here; no portal session, so the signed single-use state is the identity).
//  1. state: HMAC + 10-minute expiry, then its nonce is used up (a replay fails).
//  2. Google's code -> tokens. calendar.events must be granted (else the grant
//     is revoked and nothing is saved); free/busy is optional.
//  3. The refresh token is saved encrypted in solarGoogleTokens/{uid} and the
//     status mirrored onto solarAvailability/{uid}.googleCalendar.
// Never logs or forwards a token or the code.
//
// Not bound to a browser session, by design: the app starts the flow in its
// WebView and Google finishes it in the browser sheet, which shares no
// cookies with it. That leaves reverse login-CSRF possible (someone tricks a
// consultant into finishing THEIR OWN sign-in link, attaching the attacker's
// Google account). Accepted: it needs a fresh link minted by a signed-in
// consultant, and the Setup row shows "Connected as <email>", which is where
// a wrong account is noticed (and disconnected).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  let from: ConnectFrom | null = null;
  let returnTo: ConnectReturn = 'setup';
  try {
    const state = await consumeState(q.get('state'));
    if (!state.ok) return landing(request, null, returnTo, { ok: false, reason: state.reason });
    from = state.from;
    returnTo = state.returnTo;

    if (q.get('error')) return landing(request, from, returnTo, { ok: false, reason: 'denied' });
    const code = q.get('code');
    const client = googleClient();
    if (!code || !client) return landing(request, from, returnTo, { ok: false, reason: code ? 'server' : 'denied' });
    if (!(await isConsultant(state.uid))) return landing(request, from, returnTo, { ok: false, reason: 'not_consultant' });

    const grant = await exchangeCode(client, code, state.redirectUri);
    if (!grant.ok) {
      if (grant.accessToken) await revokeToken(grant.accessToken);
      return landing(request, from, returnTo, { ok: false, reason: 'exchange' });
    }
    if (!grant.scopes.includes(SCOPE_EVENTS)) {
      // Calendar access unticked on the consent screen: nothing to use, so let go of the grant.
      await revokeToken(grant.refreshToken);
      return landing(request, from, returnTo, { ok: false, reason: 'scope' });
    }
    const status = await saveConnection(state.uid, {
      refreshToken: grant.refreshToken,
      scopes: grant.scopes,
      email: grant.email,
    });
    return landing(request, from, returnTo, { ok: true, freeBusy: status.freeBusy });
  } catch (error) {
    console.error('Google Calendar callback failed:', error instanceof Error ? error.message : '');
    return landing(request, from, returnTo, { ok: false, reason: 'server' });
  }
}
