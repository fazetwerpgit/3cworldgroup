import { NextResponse } from 'next/server';
import { renagStaleTasks } from '@/lib/alerts/alertTasks';
import { adminDb } from '@/lib/firebase/admin';
import { sendDeferredEsignReadyEmails } from '@/lib/esign/autoSend';
import { runOnboardingNudges } from '@/lib/onboarding/stallDetection';

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
  // Invite-link hires sign on the spot; the "ready to sign" email they skipped
  // goes out here only if a document is still unsigned.
  let deferredReady: { sent: number; cleared: number } = { sent: 0, cleared: 0 };
  try {
    deferredReady = await sendDeferredEsignReadyEmails(now);
  } catch (error) {
    console.error('[cron] deferred ready-to-sign notices failed', error);
  }
  const nudges = await runOnboardingNudges(now);
  const renagged = await renagStaleTasks(now);
  return NextResponse.json({ ...nudges, renagged, deferredReady });
}
