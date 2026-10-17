import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { retryPendingChatEvidence } from '@/lib/chat/evidence';
import { sweepAbandonedChatUploads, type PendingSweepResult } from '@/lib/chat/pendingSweep';

// Once a day, retries the moderation copies that failed when a reported chat
// message was deleted (chatEvidencePending, written by lib/chat/evidence): copy
// the upload again, point the reports at it, delete the chat objects, drop the
// doc. Up to 50 per run; a failed retry stays for the next one.
//
// Then deletes abandoned direct uploads: chat-pending/ objects older than an
// hour (up to 500 per run, lib/chat/pendingSweep). That step failing does not
// fail the evidence retry.
//
// vercel.json schedules this at 09:00 UTC, an hour no other cron uses.

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

  try {
    const run = await retryPendingChatEvidence();
    let pendingUploads: PendingSweepResult | { error: string };
    try {
      pendingUploads = await sweepAbandonedChatUploads();
    } catch (error) {
      console.error('[chat evidence] pending upload sweep failed', (error as { code?: unknown } | null)?.code ?? 'unknown');
      pendingUploads = { error: 'pending sweep failed' };
    }
    return NextResponse.json({ ok: true, ...run, pendingUploads });
  } catch (error) {
    console.error('[chat evidence] sweep failed', (error as { code?: unknown } | null)?.code ?? 'unknown');
    return NextResponse.json({ ok: false, error: 'sweep failed' }, { status: 500 });
  }
}
