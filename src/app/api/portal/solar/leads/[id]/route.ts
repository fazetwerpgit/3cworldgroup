import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { loadAvailability, requireSolarUser } from '@/lib/solar/server';
import { hasLeadContact, hasLeadExtras, isCreditTier, isSolarLeadStatus, parseLeadContact, parseLeadExtras } from '@/lib/solar/leadFields';
import { SOLAR_STAGE_ROLES, readStage, stagePatchForStatus } from '@/lib/solar/leadStage';
import { announceBookingCancel, isLiveBooking, stageBookingCancel } from '@/lib/solar/bookingCancel';

const LEAD_CLOSED_ERROR = 'This lead is closed, so its contact details can no longer be changed.';

/** Contact fixes stop once the lead has a stage or is sold / lost. */
function leadIsClosed(data: Record<string, unknown>): boolean {
  return readStage(data).stage !== null || data.status === 'sold' || data.status === 'lost';
}

/** What the deck's usage slide saves after the lead exists. */
const USAGE_KEYS = ['monthlyKwh', 'usage'] as const;

/** The sales side, as the stage route counts it: closer roles and the consultants set in Admin > Solar > Setup. */
async function isSolarConsultant(gate: { uid: string; solarRole?: string | null }): Promise<boolean> {
  if (gate.solarRole && (SOLAR_STAGE_ROLES as readonly string[]).includes(gate.solarRole)) return true;
  const consultants = await loadAvailability().catch(() => []);
  return consultants.some((c) => c.consultantUid === gate.uid);
}

// PATCH /api/portal/solar/leads/{id}
//   {creditTier: 'purchase_600' | 'lease_ppa_680'} -> 200 {success, id}.
//     The rep who created the lead, or an admin.
//   {status: 'new' | 'booked' | 'sold' | 'lost'} -> 200 {success, id, status}.
//     Admins only. 'sold' and 'lost' close the lead; 'new' or 'booked' reopen
//     it, and the server picks which: 'booked' while a live booking holds its
//     slot, else 'new'. 'lost' also cancels the lead's live booking in the
//     same transaction (slot freed, bookingId cleared, rep and consultant
//     notified) and answers its id as cancelledBookingId. 'sold' keeps it.
//     The sales-dept stage follows (lib/solar/leadStage stagePatchForStatus):
//     sold = appointment_demoed + sale, lost = appointment_demoed + no_sale,
//     reopen clears a closing stage. Finer stages: PATCH .../{id}/stage.
//   {creditTier?, roofType?, heavyShade?, needsReview?, monthlyKwh?, usage?}
//     -> 200 {success, id}. The creator or an admin; validated as on create
//     (a blocked roof is refused; monthlyKwh rounded; usage 4KB of JSON max).
//     A consultant (closer role or Admin > Solar > Setup) may send
//     monthlyKwh / usage alone.
//   {first, last, phone, email, address, city, state, zip} (with or without
//     the fields above) -> 200 {success, id}. The rep who created the lead
//     or an admin/owner, while it is open (no stage, not sold or lost; else 409). Checked
//     as on create: first, last and a valid email required, phone-shaped
//     phone; a missing key reads as ''. The review slide's Edit sends these.
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
      if (asked === 'lost') {
        // One transaction: the lead closes and its live booking (if any) is
        // cancelled, so the slot opens and lead.bookingId clears.
        const now = new Date();
        const cancelled = await db.runTransaction(async (tx) => {
          const lead = await tx.get(ref);
          if (!lead.exists) return undefined;
          const statusPatch = {
            status: 'lost',
            statusChangedAt: now,
            statusChangedBy: gate.uid,
            updatedAt: now,
            ...stagePatchForStatus((lead.data() ?? {}) as Record<string, unknown>, 'lost', gate.uid, now),
          };
          const bookingId = typeof lead.get('bookingId') === 'string' ? (lead.get('bookingId') as string) : '';
          const bookingRef = bookingId ? db.collection('solarBookings').doc(bookingId) : null;
          const booking = bookingRef ? await tx.get(bookingRef) : null;
          if (bookingRef && booking && isLiveBooking(booking)) {
            return stageBookingCancel(tx, {
              id: bookingId, bookingRef, booking, leadRef: ref, lead, by: gate.uid, now, leadPatch: statusPatch,
            });
          }
          tx.update(ref, statusPatch);
          return null;
        });
        if (cancelled === undefined) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        if (cancelled) await announceBookingCancel(cancelled, gate.uid, 'lost');
        return NextResponse.json({
          success: true, id, status: 'lost', ...(cancelled ? { cancelledBookingId: cancelled.id } : {}),
        });
      }
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
      await ref.update({
        status,
        statusChangedAt: now,
        statusChangedBy: gate.uid,
        updatedAt: now,
        ...stagePatchForStatus((snap.data() ?? {}) as Record<string, unknown>, status, gate.uid, now),
      });
      return NextResponse.json({ success: true, id, status });
    }

    const patch: Record<string, unknown> = {};
    const contactAsked = hasLeadContact(body);
    if (body.creditTier !== undefined || (!hasLeadExtras(body) && !contactAsked)) {
      if (!isCreditTier(body.creditTier)) return NextResponse.json({ error: 'Invalid creditTier' }, { status: 400 });
      patch.creditTier = body.creditTier;
    }
    const extras = parseLeadExtras(body);
    if (!extras.ok) return NextResponse.json({ error: extras.error }, { status: 400 });
    Object.assign(patch, extras.extras);
    // monthlyKwh null: the usage helper was cleared, so the stored figure goes.
    if (patch.monthlyKwh === null) patch.monthlyKwh = FieldValue.delete();
    if (contactAsked) {
      const contact = parseLeadContact(body);
      if (!contact.ok) return NextResponse.json({ error: contact.error }, { status: 400 });
      Object.assign(patch, contact.contact);
    }

    const ref = db.collection('solarLeads').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (contactAsked) {
      if (snap.get('repUid') !== gate.uid && !gate.isAdmin) {
        return NextResponse.json({ error: 'Only the rep who added this lead, or an admin, can change its contact details' }, { status: 403 });
      }
      if (leadIsClosed((snap.data() ?? {}) as Record<string, unknown>)) {
        return NextResponse.json({ error: LEAD_CLOSED_ERROR }, { status: 409 });
      }
    }
    if (snap.get('repUid') !== gate.uid && !gate.isAdmin) {
      // A Setup consultant may fill in the usage numbers, nothing else.
      const usageOnly = Object.keys(patch).every((key) => (USAGE_KEYS as readonly string[]).includes(key));
      if (!usageOnly || !(await isSolarConsultant(gate))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    if (!contactAsked) {
      await ref.update({ ...patch, updatedAt: new Date() });
      return NextResponse.json({ success: true, id });
    }

    // A contact fix on a booked lead also fixes the name and email its live
    // booking carries (the consultant's notices and reminders read them), in
    // one transaction with the lead.
    const closedNow = await db.runTransaction(async (tx) => {
      const lead = await tx.get(ref);
      if (!lead.exists) return 'missing' as const;
      const data = (lead.data() ?? {}) as Record<string, unknown>;
      if (leadIsClosed(data)) return 'closed' as const;
      const bookingId = typeof data.bookingId === 'string' ? data.bookingId : '';
      const bookingRef = bookingId ? db.collection('solarBookings').doc(bookingId) : null;
      const booking = bookingRef ? await tx.get(bookingRef) : null;
      tx.update(ref, { ...patch, updatedAt: new Date() });
      if (bookingRef && isLiveBooking(booking)) {
        tx.update(bookingRef, {
          customerName: `${patch.first ?? ''} ${patch.last ?? ''}`.trim(),
          customerEmail: typeof patch.email === 'string' ? patch.email : '',
        });
      }
      return 'ok' as const;
    });
    if (closedNow === 'missing') return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (closedNow === 'closed') return NextResponse.json({ error: LEAD_CLOSED_ERROR }, { status: 409 });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error updating solar lead:', error);
    return NextResponse.json({ error: 'Failed to update solar lead' }, { status: 500 });
  }
}
