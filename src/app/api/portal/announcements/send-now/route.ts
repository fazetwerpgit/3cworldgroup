import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { ANNOUNCEMENTS, sendAnnouncement } from '@/lib/announcements/send';
import { announcementSendNowSchema } from '@/lib/announcements/schedule';

export const maxDuration = 300;

// gRPC ALREADY_EXISTS, what DocumentReference.create() throws for a taken id.
const ALREADY_EXISTS = 6;

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
    if ((error as { code?: unknown })?.code === ALREADY_EXISTS) {
      return NextResponse.json({ error: 'This announcement was already sent' }, { status: 409 });
    }
    console.error('Error creating send-now announcement:', error);
    return NextResponse.json({ error: 'Failed to send the announcement' }, { status: 500 });
  }

  const outcome = await sendAnnouncement(adminDb, requestId, now);
  if (outcome.status === 'sent') {
    return NextResponse.json({ id: requestId, sentCount: outcome.sentCount, failedCount: outcome.failedCount });
  }
  if (outcome.status === 'skipped') {
    return NextResponse.json({ error: 'This announcement was already sent' }, { status: 409 });
  }
  return NextResponse.json({ error: 'The send failed. Check the list before trying again.' }, { status: 500 });
}
