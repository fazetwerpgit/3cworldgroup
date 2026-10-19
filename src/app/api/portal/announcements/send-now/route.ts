import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { ANNOUNCEMENTS, sendAnnouncement } from '@/lib/announcements/send';
import { announcementSendNowSchema } from '@/lib/announcements/schedule';

export const maxDuration = 300;

// gRPC ALREADY_EXISTS, what DocumentReference.create() throws for a taken id.
const ALREADY_EXISTS = 6;

const SEND_FAILED = 'The send failed. Check the list before trying again.';
const NOT_STARTED_ERROR = 'The send did not start, so nobody received it.';

// POST /api/portal/announcements/send-now { title, body, requestId } — sends to
// every active user immediately, for when the morning cron slot has passed.
// It is stored as an announcement due now and goes through the cron's own
// claim-and-send path; requestId is the doc id, so a repeat request is a 409,
// never a second send.
export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const parsed = announcementSendNowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid announcement' }, { status: 400 });
  }
  const { title, body, requestId } = parsed.data;
  const now = new Date();

  try {
    await adminDb.collection(ANNOUNCEMENTS).doc(requestId).create({
      title,
      body,
      sendAt: now,
      status: 'scheduled',
      sendNow: true,
      createdBy: gate.uid,
      createdAt: FieldValue.serverTimestamp(),
      sentAt: null,
      sentCount: 0,
      failedCount: 0,
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code !== ALREADY_EXISTS) {
      console.error('Error creating send-now announcement:', error);
      return NextResponse.json({ error: 'Failed to send the announcement' }, { status: 500 });
    }
    // Same requestId again: only a send that FAILED BEFORE any push went out
    // may be retried. Flip it back to scheduled atomically so two taps can't
    // both re-send.
    const ref = adminDb.collection(ANNOUNCEMENTS).doc(requestId);
    let retry: boolean;
    try {
      retry = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.get('status') !== 'failed' || snap.get('fanOutStarted') === true) return false;
        tx.update(ref, { status: 'scheduled', sendAt: now, error: FieldValue.delete() });
        return true;
      });
    } catch (error) {
      console.error('Error re-arming send-now announcement:', error);
      return NextResponse.json({ error: SEND_FAILED }, { status: 500 });
    }
    if (!retry) {
      return NextResponse.json(
        { error: 'This announcement already went out (or partly did), so it was not sent again. Check the list.' },
        { status: 409 }
      );
    }
  }

  let outcome: Awaited<ReturnType<typeof sendAnnouncement>>;
  try {
    outcome = await sendAnnouncement(adminDb, requestId, now);
  } catch (error) {
    // The claim itself threw (contention, a Firestore error), so no push went
    // out. Left 'scheduled' and due, the cron would send it at its next run and
    // a retry with this requestId would wrongly 409. Park it as 'failed'
    // (fanOutStarted unset) so the cron skips it and the retry re-arms it.
    console.error('Error claiming send-now announcement:', error);
    const ref = adminDb.collection(ANNOUNCEMENTS).doc(requestId);
    await adminDb
      .runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.get('status') !== 'scheduled') return;
        tx.update(ref, { status: 'failed', error: NOT_STARTED_ERROR });
      })
      .catch((parkError) => console.error('Error parking unsent send-now announcement:', parkError));
    return NextResponse.json({ error: SEND_FAILED }, { status: 500 });
  }
  if (outcome.status === 'sent') {
    return NextResponse.json({ id: requestId, sentCount: outcome.sentCount, failedCount: outcome.failedCount });
  }
  if (outcome.status === 'skipped') {
    return NextResponse.json({ error: 'This announcement was already sent' }, { status: 409 });
  }
  return NextResponse.json({ error: SEND_FAILED }, { status: 500 });
}
