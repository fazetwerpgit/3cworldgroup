import { bearerMatches } from '@/lib/auth/secretCompare';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { withCronRun } from '@/lib/cron/runLog';
import { isCalloutNudgeHour, runCalloutNudges } from '@/lib/alerts/calloutNudges';

// 9 PM America/Chicago: a rep who called out more sales in All Company today
// than they logged gets one push to log the rest (lib/alerts/calloutNudges).
//
// vercel.json schedules this at 02:00 (slot=cdt) AND 03:00 UTC (slot=cst)
// every day, because Vercel crons run in UTC and 9 PM Chicago is one or the
// other depending on DST. The run only proceeds when the Chicago hour is 21;
// the per-rep-per-day claim makes a double trigger harmless anyway.
//
// CALLOUT_NUDGE_OFF=true turns every run into a dry run (nothing claimed or sent).
//
// A run with any claim or dispatch error is logged ok:false in cronRuns, so the
// failure shows up there instead of hiding behind a 200.

export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'cron secret is not configured' }, { status: 500 });
  }

  if (!bearerMatches(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json({ error: 'firebase admin database is not configured' }, { status: 500 });
  }

  const now = new Date();
  if (!isCalloutNudgeHour(now)) {
    return NextResponse.json({ skipped: 'not_send_hour', at: now.toISOString() });
  }

  const db = adminDb;
  const summary = await withCronRun(db, 'callout-nudges', request, () => runCalloutNudges({ db, now }), (s) => s.errors === 0);
  return NextResponse.json(summary);
}
