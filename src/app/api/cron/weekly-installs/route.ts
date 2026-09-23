import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { runWeeklyInstallsEmail, weeklyRunConfig } from '@/lib/weeklyInstalls/run';
import { isSendHour } from '@/lib/weeklyInstalls/week';

// Monday 8 AM America/Chicago: each rep's "what got installed" email.
//
// vercel.json schedules this at 13:00 AND 14:00 UTC on Mondays, because Vercel
// crons run in UTC and 8 AM Chicago is one or the other depending on DST. The
// run only proceeds when the Chicago hour is 8; the send log (sendLog.ts) makes
// a double trigger harmless anyway.
//
// `?force=1` skips the hour gate, and ONLY when WEEKLY_INSTALLS_EMAIL_ONLY_TO
// is set, so the owner can trigger a redirected test run at any time without
// ever being able to blast the reps off-schedule.

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'cron secret is not configured' }, { status: 500 });
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json({ error: 'firebase admin database is not configured' }, { status: 500 });
  }

  const now = new Date();
  const config = weeklyRunConfig();
  const force = new URL(request.url).searchParams.get('force') === '1' && !!config.onlyTo;
  if (!force && !isSendHour(now)) {
    return NextResponse.json({ skipped: 'not_send_hour', at: now.toISOString() });
  }

  const summary = await runWeeklyInstallsEmail({ db: adminDb, now, config });
  return NextResponse.json(summary);
}
