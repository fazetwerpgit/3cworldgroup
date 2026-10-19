import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

class Answer {
  constructor(readonly body: Record<string, unknown>, readonly status: number) {}
}

// PATCH /api/portal/solar/bookings/{id} {status: 'cancelled'} -> 200 {success, id}.
// An admin, or the booking's own consultant. In one transaction: the booking
// reads 'cancelled' (so its slot opens again: openSlots skips cancelled
// bookings, and POST bookings may take the slot over), and its lead lets go of
// it (bookingId cleared; a 'booked' lead goes back to 'new'), so the lead can
// be booked again. Cancelling a cancelled booking is a no-op 200.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const { id } = await params;
    // bookingDocId is `${uid}_${ISO start}`: letters, digits, _ - : .
    if (!/^[A-Za-z0-9_.:-]{1,300}$/.test(id)) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.status !== 'cancelled') {
      return NextResponse.json({ error: "status must be 'cancelled'" }, { status: 400 });
    }

    const ref = db.collection('solarBookings').doc(id);
    const now = new Date();
    try {
      await db.runTransaction(async (tx) => {
        const booking = await tx.get(ref);
        if (!booking.exists) throw new Answer({ error: 'Booking not found' }, 404);
        if (!gate.isAdmin && booking.get('consultantUid') !== gate.uid) throw new Answer({ error: 'Forbidden' }, 403);
        if (booking.get('status') === 'cancelled') return;
        const leadId = typeof booking.get('leadId') === 'string' ? (booking.get('leadId') as string) : '';
        const leadRef = leadId ? db.collection('solarLeads').doc(leadId) : null;
        const lead = leadRef ? await tx.get(leadRef) : null;

        tx.update(ref, { status: 'cancelled', cancelledAt: now, cancelledBy: gate.uid });
        if (leadRef && lead?.exists && lead.get('bookingId') === id) {
          tx.update(leadRef, {
            bookingId: null,
            ...(lead.get('status') === 'booked' ? { status: 'new' } : {}),
            updatedAt: now,
          });
        }
      });
    } catch (error) {
      if (error instanceof Answer) return NextResponse.json(error.body, { status: error.status });
      throw error;
    }
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error cancelling solar booking:', error);
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }
}
