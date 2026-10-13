import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { runSearchStats } from '@/lib/search/searchStats';

// Once a day, Google Search Console's figures for the owner's "Hiring from
// search" card: showings and clicks for the last two weeks, the top searches,
// and whether each job page is on Google (lib/search/searchStats). One write,
// config/searchStats.
//
// vercel.json schedules this at 11:00 UTC (early morning in the US), an hour no
// other cron uses. Search Console data lags about two days, so once a day is
// all it can change.
//
// SEARCH_STATS_OFF=true turns every run into a dry run (Google is read, nothing written).

export const maxDuration = 60;

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

  const run = await runSearchStats({ db: adminDb, now: new Date() });
  return NextResponse.json({ ok: run.ok, error: run.error, dryRun: run.dryRun });
}
