import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { sendTestToSelf } from '@/lib/announcements/send';
import { announcementMessageSchema } from '@/lib/announcements/schedule';

// POST /api/portal/announcements/test { title, body } — sends the draft right
// now to the CALLER's own devices only (the token's uid, never a client-given
// one), so the owner can see it on their phone before scheduling.
export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const parsed = announcementMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid announcement' }, { status: 400 });
  }

  try {
    const result = await sendTestToSelf(adminDb, gate.uid, parsed.data);
    if (result.devices === 0) {
      return NextResponse.json(
        { error: 'Notifications are off on your devices. Turn them on in Settings, then try again.' },
        { status: 409 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending announcement test:', error);
    return NextResponse.json({ error: 'Failed to send the test' }, { status: 500 });
  }
}
