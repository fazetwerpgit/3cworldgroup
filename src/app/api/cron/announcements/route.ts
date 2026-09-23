import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { runDueAnnouncements } from '@/lib/announcements/send';

// Sends the owner's scheduled push announcements that are due.
//
// vercel.json runs this daily at 13:00 AND 14:00 UTC (Hobby plan: each cron at
// most once a day). Announcements are stored at 8:00 AM Chicago, so in summer
// the 13:00 run sends them and in winter the 14:00 run does; the other run
// finds nothing due. Each send is claimed in a transaction first, so an
// overlapping or repeated run can't send one twice.

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

  const summary = await runDueAnnouncements({ db: adminDb, now: new Date() });
  return NextResponse.json(summary);
}
