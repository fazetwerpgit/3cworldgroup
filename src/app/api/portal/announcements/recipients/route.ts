import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { announcementRecipients } from '@/lib/announcements/send';

export const dynamic = 'force-dynamic';

// GET /api/portal/announcements/recipients — how many people a send reaches
// right now (active users with notifications on), for the "Send now" confirm.
export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  try {
    const recipients = await announcementRecipients(adminDb);
    return NextResponse.json({ count: recipients.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error counting announcement recipients:', error);
    return NextResponse.json({ error: 'Failed to count recipients' }, { status: 500 });
  }
}
