import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { withCronRun } from '@/lib/cron/runLog';
import { rebuildLeaderboardSnapshot } from '@/lib/leaderboard/snapshotStore';

// The leaderboard snapshot's safety net (lib/leaderboard/snapshotStore). Board
// reads rebuild it themselves after sale and carrier-order writes (debounced),
// and on the first read of a new day. This run rebuilds it once a day anyway,
// just after Chicago midnight, so a write no code path marked (a script, the
// console) is picked up and the morning's first reader finds today's board
// ready instead of waiting on the rebuild.
//
// vercel.json schedules this at 06:10 UTC (after midnight Central in CDT and CST).

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

  try {
    const summary = await withCronRun(adminDb, 'leaderboard-snapshot', request, async () => {
      const snapshot = await rebuildLeaderboardSnapshot(new Date());
      return { ok: true, periods: Object.keys(snapshot.periods).length, months: snapshot.months.length };
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[leaderboard snapshot cron] rebuild failed', error);
    return NextResponse.json({ ok: false, error: 'rebuild failed' }, { status: 500 });
  }
}
