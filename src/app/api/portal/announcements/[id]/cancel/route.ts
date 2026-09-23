import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { ANNOUNCEMENTS } from '@/lib/announcements/send';

// POST /api/portal/announcements/{id}/cancel — stops a scheduled announcement.
// Transactional against the cron's claim: once a send has started (status
// 'sending' or later) it can no longer be cancelled.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const db = adminDb;

  const { id } = await params;
  try {
    const outcome = await db.runTransaction(async (tx) => {
      const ref = db.collection(ANNOUNCEMENTS).doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) return 'missing' as const;
      if (snap.data()?.status !== 'scheduled') return 'started' as const;
      tx.update(ref, { status: 'cancelled', cancelledBy: gate.uid, cancelledAt: FieldValue.serverTimestamp() });
      return 'cancelled' as const;
    });
    if (outcome === 'missing') return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    if (outcome === 'started') {
      return NextResponse.json({ error: 'This announcement is no longer scheduled' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling announcement:', error);
    return NextResponse.json({ error: 'Failed to cancel the announcement' }, { status: 500 });
  }
}
