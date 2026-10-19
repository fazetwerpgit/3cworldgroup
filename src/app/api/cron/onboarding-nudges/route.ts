import { bearerMatches } from '@/lib/auth/secretCompare';
import { NextResponse } from 'next/server';
import { renagStaleTasks } from '@/lib/alerts/alertTasks';
import { adminDb } from '@/lib/firebase/admin';
import { withCronRun } from '@/lib/cron/runLog';
import { sendDeferredEsignReadyEmails } from '@/lib/esign/autoSend';
import { runOnboardingNudges } from '@/lib/onboarding/stallDetection';

export const maxDuration = 300;

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
  const summary = await withCronRun(adminDb, 'onboarding-nudges', request, async () => {
    // Invite-link hires sign on the spot; the "ready to sign" email they skipped
    // goes out here only if a document is still unsigned.
    let deferredReady = { sent: 0, cleared: 0, retrying: 0 };
    try {
      deferredReady = await sendDeferredEsignReadyEmails(now);
    } catch (error) {
      console.error('[cron] deferred ready-to-sign notices failed', error);
    }
    const nudges = await runOnboardingNudges(now);
    const renagged = await renagStaleTasks(now);
    return { ...nudges, renagged, deferredReady };
  });
  return NextResponse.json(summary);
}
