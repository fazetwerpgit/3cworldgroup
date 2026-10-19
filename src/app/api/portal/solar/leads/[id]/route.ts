import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireSolarUser } from '@/lib/solar/server';
import { isCreditTier, isSolarLeadStatus } from '@/lib/solar/leadFields';

// PATCH /api/portal/solar/leads/{id}
//   {creditTier: 'purchase_600' | 'lease_ppa_680'} -> 200 {success, id}.
//     The rep who created the lead, or an admin.
//   {status: 'new' | 'booked' | 'sold' | 'lost'} -> 200 {success, id, status}.
//     Admins only. 'sold' and 'lost' close the lead; 'new' or 'booked' reopen
//     it, and the server picks which: 'booked' while a live booking holds its
//     slot, else 'new'. Closing never touches the booking (cancel it with
//     PATCH bookings/{id}).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

    if ('status' in body) {
      if (!gate.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const asked = body.status;
      if (!isSolarLeadStatus(asked)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      const ref = db.collection('solarLeads').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      let status = asked;
      if (asked === 'new' || asked === 'booked') {
        const bookingId = snap.get('bookingId');
        const booking = typeof bookingId === 'string' && bookingId
          ? await db.collection('solarBookings').doc(bookingId).get()
          : null;
        status = booking?.exists && booking.get('status') !== 'cancelled' ? 'booked' : 'new';
      }
      const now = new Date();
      await ref.update({ status, statusChangedAt: now, statusChangedBy: gate.uid, updatedAt: now });
      return NextResponse.json({ success: true, id, status });
    }

    const creditTier = body.creditTier;
    if (!isCreditTier(creditTier)) return NextResponse.json({ error: 'Invalid creditTier' }, { status: 400 });

    const ref = db.collection('solarLeads').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (snap.get('repUid') !== gate.uid && !gate.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await ref.update({ creditTier, updatedAt: new Date() });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error updating solar lead:', error);
    return NextResponse.json({ error: 'Failed to update solar lead' }, { status: 500 });
  }
}
