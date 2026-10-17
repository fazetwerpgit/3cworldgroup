import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { resolveSubject } from '@/lib/auth/viewAs';
import { repCalloutDay } from '@/lib/alerts/calloutNudges';
import type { CalloutStatus } from '@/lib/sales/calloutNudge';
import { isDemoAccount } from '@/lib/users/demoAccount';

export const runtime = 'nodejs';

// GET /api/portal/sales/callouts - the caller's own sales called out in All
// Company today against the sales they logged for today, for the quiet line on
// rep Home (lib/alerts/calloutNudges). Counted here with the Admin SDK, so a rep
// needs no read on other people's messages or sales; only numbers come back.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const subject = await resolveSubject(request, gate);
    if (!subject.ok) {
      return NextResponse.json({ error: subject.error }, { status: subject.status });
    }
    const [{ day, callouts, logged, gap }, userSnap] = await Promise.all([
      repCalloutDay(adminDb, subject.uid),
      adminDb.collection('users').doc(subject.uid).get(),
    ]);
    // A demo account has no chat to call a sale out in, so it is never short.
    const demo = isDemoAccount(userSnap.data());
    const body: CalloutStatus = { day, callouts, logged, gap: demo ? 0 : gap };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[sales/callouts]', error);
    return NextResponse.json({ error: 'Failed to load callouts' }, { status: 500 });
  }
}
