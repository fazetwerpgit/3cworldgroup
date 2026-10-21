import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { userRateLimited } from '@/lib/userRateLimits';
import { connectReturnOf, disconnect, isConsultant, startConnect } from '@/lib/solar/google/connection';
import { googleStatusOf } from '@/lib/solar/google/status';

const UID = /^[A-Za-z0-9_-]{1,128}$/;
const NOT_CONSULTANT = 'Only a saved consultant can connect a calendar.';

// GET /api/portal/solar/google/connect -> 200 {googleCalendar: status | null}.
// The caller's own connection (the Setup row polls it while the app's browser
// sheet is open). Never carries a token.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const snap = await adminDb.collection('solarAvailability').doc(gate.uid).get();
  return NextResponse.json({ googleCalendar: snap.exists ? googleStatusOf(snap.get('googleCalendar')) ?? null : null });
}

// POST /api/portal/solar/google/connect {from?: 'app' | 'web', returnTo?: 'setup' | 'availability'} -> 200 {url}.
// The caller connects THEIR OWN Google account, so the uid is the verified
// caller's, never the body's. Only a consultant (a solarAvailability doc,
// admin/owner or not) may. `url` is Google's consent page; its `state` is
// HMAC-signed, expires in 10 minutes and works once. `from` only decides
// where the callback lands ('app': a page that says to go back to the app), and
// `returnTo` which page that is (anything else is 'setup'; never a free path).
export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const limited = userRateLimited('formSubmit', gate.uid);
  if (limited) return limited;
  try {
    if (!(await isConsultant(gate.uid))) return NextResponse.json({ error: NOT_CONSULTANT }, { status: 403 });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const started = await startConnect(
      gate.uid,
      request.url,
      body?.from === 'app' ? 'app' : 'web',
      connectReturnOf(body?.returnTo)
    );
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
    return NextResponse.json({ url: started.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error starting Google Calendar connect:', error instanceof Error ? error.message : '');
    return NextResponse.json({ error: "Couldn't start the Google sign-in. Try again." }, { status: 500 });
  }
}

// DELETE /api/portal/solar/google/connect[?uid=...] -> 200 {success, revoked}.
// A consultant removes their own connection; an admin may remove anyone's.
// Google revokes the grant (revoked: false when Google couldn't be reached),
// the stored token is deleted and the status cleared either way.
export async function DELETE(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const target = request.nextUrl.searchParams.get('uid') || gate.uid;
  if (!UID.test(target)) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });
  if (target !== gate.uid && !gate.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { revoked } = await disconnect(target);
    return NextResponse.json({ success: true, revoked });
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error instanceof Error ? error.message : '');
    return NextResponse.json({ error: "Couldn't disconnect. Try again." }, { status: 500 });
  }
}
