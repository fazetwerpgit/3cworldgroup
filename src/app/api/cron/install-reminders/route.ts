import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { isReminderHour } from '@/lib/reminders/installEve';
import { reminderRunConfig, runInstallReminders } from '@/lib/reminders/run';

// 6 PM America/Chicago: each rep's push about tomorrow's installs, so they can
// text the customer a reminder to be home.
//
// vercel.json schedules this at 23:00 (slot=cdt) AND 00:00 UTC (slot=cst)
// every day, because Vercel crons run in UTC and 6 PM Chicago is one or the
// other depending on DST. The run only proceeds when the Chicago hour is 18;
// the per-sale claim (run.ts) makes a double trigger harmless anyway.
//
// `?force=1` skips the hour gate, and ONLY when INSTALL_REMINDERS_ONLY_TO is
// set, so the owner can trigger a one-rep test at any time without ever being
// able to push every rep off-schedule.

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
  const config = reminderRunConfig();
  const force = new URL(request.url).searchParams.get('force') === '1' && !!config.onlyTo;
  if (!force && !isReminderHour(now)) {
    return NextResponse.json({ skipped: 'not_send_hour', at: now.toISOString() });
  }

  const summary = await runInstallReminders({ db: adminDb, now, config });
  return NextResponse.json(summary);
}
