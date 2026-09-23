import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { ANNOUNCEMENTS, toAnnouncementView } from '@/lib/announcements/send';
import { announcementCreateSchema, nextSendDay, sendAtForDay, sendDayError } from '@/lib/announcements/schedule';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 50;

// GET /api/portal/announcements — the owner's scheduled and sent push
// announcements, newest first, plus the first day a new one can go out.
export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  try {
    const snap = await adminDb.collection(ANNOUNCEMENTS).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get();
    return NextResponse.json(
      {
        announcements: snap.docs.map((doc) => toAnnouncementView(doc.id, doc.data())),
        nextSendDate: nextSendDay(new Date()),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error listing announcements:', error);
    return NextResponse.json({ error: 'Failed to load announcements' }, { status: 500 });
  }
}

// POST /api/portal/announcements { title, body, sendDate: 'YYYY-MM-DD' } —
// schedules a push to every active user for about 8 AM Central on that day.
export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const parsed = announcementCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid announcement' }, { status: 400 });
  }
  const { title, body, sendDate } = parsed.data;
  const dayError = sendDayError(sendDate, new Date());
  if (dayError) return NextResponse.json({ error: dayError }, { status: 400 });

  try {
    const ref = await adminDb.collection(ANNOUNCEMENTS).add({
      title,
      body,
      sendAt: sendAtForDay(sendDate),
      status: 'scheduled',
      createdBy: gate.uid,
      createdAt: FieldValue.serverTimestamp(),
      sentAt: null,
      sentCount: 0,
      failedCount: 0,
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error('Error scheduling announcement:', error);
    return NextResponse.json({ error: 'Failed to schedule the announcement' }, { status: 500 });
  }
}
