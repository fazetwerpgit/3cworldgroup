import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { announceBookingCancel, isLiveBooking, stageBookingCancel, type CancelledBooking } from '@/lib/solar/bookingCancel';
import { isSoldLead } from '@/lib/solar/closePermission';
import { applyProofPinChange } from '@/lib/solar/proofPins';

class Answer {
  constructor(readonly body: Record<string, unknown>, readonly status: number) {}
}

// PATCH /api/portal/solar/bookings/{id} {status: 'cancelled'} -> 200 {success, id}.
// An admin, or the booking's own consultant. In one transaction the booking
// reads 'cancelled' and its lead lets go of it (stageBookingCancel), so the
// slot opens and the lead can be booked again. Then the rep and consultant get
// the cancel notice (announceBookingCancel). The lead's door loses its proof
// pin (lib/solar/proofPins) unless the lead is sold. Cancelling a cancelled
// booking is a no-op 200 that notifies nobody.
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
    let cancelled: CancelledBooking | null = null;
    // The lead as the cancel read it: its door's proof pin goes after the commit.
    let pinLead = null as Record<string, unknown> | null;
    try {
      cancelled = await db.runTransaction(async (tx) => {
        const booking = await tx.get(ref);
        if (!booking.exists) throw new Answer({ error: 'Booking not found' }, 404);
        if (!gate.isAdmin && booking.get('consultantUid') !== gate.uid) throw new Answer({ error: 'Forbidden' }, 403);
        if (!isLiveBooking(booking)) return null;
        const leadId = typeof booking.get('leadId') === 'string' ? (booking.get('leadId') as string) : '';
        const leadRef = leadId ? db.collection('solarLeads').doc(leadId) : null;
        const lead = leadRef ? await tx.get(leadRef) : null;
        pinLead = lead?.exists ? ((lead.data() ?? {}) as Record<string, unknown>) : null;
        return stageBookingCancel(tx, { id, bookingRef: ref, booking, leadRef, lead, by: gate.uid, now });
      });
    } catch (error) {
      if (error instanceof Answer) return NextResponse.json(error.body, { status: error.status });
      throw error;
    }
    // A cancelled booking takes its "Booked nearby" pin with it (a sold lead keeps its solar pin).
    if (cancelled && pinLead && !isSoldLead(pinLead)) await applyProofPinChange(db, pinLead, 'delete', now.getTime());
    if (cancelled) await announceBookingCancel(cancelled, gate.uid);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error cancelling solar booking:', error);
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }
}
