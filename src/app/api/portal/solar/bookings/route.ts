import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { userRateLimited } from '@/lib/userRateLimits';
import { isAlreadyExists } from '@/lib/forms/idempotency';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, managerAlertEmail, solarBookingConfirmationEmail } from '@/lib/email/templates';
import { bookingDocId, isSolarMode, openSlots, type SolarMode } from '@/lib/solar/availability';
import { consultantNotice, loadAvailability, loadBookings, requireSolarUser } from '@/lib/solar/server';
import { sendLeadAlertOnce } from '@/lib/solar/leadAlert';
import { isLowCreditDecline } from '@/lib/solar/leadFields';
import { consultantBookingAttachment, customerBookingAttachment, type BookingInviteInput } from '@/lib/solar/bookingInvite';
import { solarLeadHref } from '@/lib/solar/leadView';
import {
  LEGACY_TZ,
  SOLAR_MAX_DAYS_OUT,
  formatWhen,
  formatWhenForConsultant,
  isUsTimeZone,
  withinBookingWindow,
  zoneForState,
} from '@/lib/solar/timezones';

const SLOT_TAKEN = { error: 'slot_taken' };

type Booking = {
  id: string;
  leadId: string;
  mode: SolarMode;
  start: string;
  end: string;
  consultantUid: string;
  consultantName: string;
  /** The consultant's details as they were at booking time ('' when not set). */
  meetLink: string;
  consultantPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  /** The homeowner's address from the lead ('' when it has none). */
  address: string;
  repName: string;
  customerTz: string;
  consultantTz: string;
};

/** The lead's address on one line: "12 Elm St, Austin, TX, 78701". */
function addressOf(lead: { get: (field: string) => unknown }): string {
  return ['address', 'city', 'state', 'zip']
    .map((k) => lead.get(k))
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

// Customer confirmation + consultant notice. Best-effort: the booking stands
// even when a message fails. consultantNotice() keeps the owner out of it
// while owner notifications are off (Jacob gets the notice instead). The
// customer reads the time in their zone, the consultant in theirs. Both
// emails carry an .ics invite with the same UID (lib/solar/bookingInvite).
async function announceBooking(b: Booking) {
  const when = formatWhen(b.start, b.customerTz);
  const consultantWhen = formatWhenForConsultant(b.start, b.consultantTz, b.customerTz);
  const how = b.mode === 'virtual' ? 'virtual' : 'in-person';
  const meetLink = b.mode === 'virtual' ? b.meetLink : '';
  const link = solarLeadHref(b.leadId);
  const invite: BookingInviteInput = {
    bookingId: b.id,
    mode: b.mode,
    start: b.start,
    end: b.end,
    consultantName: b.consultantName,
    meetLink: b.meetLink,
    consultantPhone: b.consultantPhone,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    address: b.address,
    leadUrl: `${appBaseUrl()}${link}`,
  };
  try {
    const notice = await consultantNotice(b.consultantUid);
    if (b.customerEmail) {
      await sendEmail({
        to: b.customerEmail,
        ...solarBookingConfirmationEmail({
          customerName: b.customerName,
          when,
          mode: b.mode,
          consultantName: b.consultantName,
          meetLink: b.meetLink,
          consultantPhone: b.consultantPhone,
          address: b.address,
          calendarAttached: true,
        }),
        ...(notice.replyTo ? { replyTo: notice.replyTo } : {}),
        attachments: [customerBookingAttachment(invite)],
        tag: 'solar-booking',
      });
    }
    const to = notice.to;
    if (!to) return;
    const title = `${notice.titlePrefix}Solar consult booked`;
    const message = `${b.customerName || 'A customer'}: ${how}, ${consultantWhen} with ${b.consultantName} (booked by ${b.repName}).`;
    await createNotification({
      userId: to.uid,
      type: 'solar_booking',
      title,
      message,
      link,
      metadata: { bookingId: b.id, leadId: b.leadId },
    }).catch((error) => console.error('solar booking notification failed:', error));
    await sendPushToUser(to.uid, { title, body: message, url: link }).catch(() => {});
    if (to.email) {
      await sendEmail({
        to: to.email,
        ...managerAlertEmail({
          title,
          message,
          link: `${appBaseUrl()}${link}`,
          ...(meetLink ? { action: { label: 'Join on Google Meet', href: meetLink } } : {}),
        }),
        attachments: [consultantBookingAttachment(invite)],
        tag: 'solar-booking',
      });
    }
  } catch (error) {
    console.error('solar booking announce failed:', error);
  }
}

/** A request that ends early with this response (inside or outside the transaction). */
class Answer {
  constructor(readonly body: Record<string, unknown>, readonly status: number) {}
}

const LEAD_ID_RE = /^[A-Za-z0-9_-]{1,300}$/;

/** The 200 body for a booking: the real one, so a retrying app shows what was booked. */
function bookedBody(id: string, b: Record<string, unknown>, duplicate: boolean) {
  return {
    success: true,
    id,
    ...(duplicate ? { duplicate: true } : {}),
    consultantUid: String(b.consultantUid ?? ''),
    consultantName: String(b.consultantName ?? ''),
    start: String(b.start ?? ''),
    mode: b.mode === 'virtual' ? 'virtual' : 'in_person',
    ...(typeof b.customerTz === 'string' && b.customerTz ? { customerTz: b.customerTz } : {}),
  };
}

// POST /api/portal/solar/bookings {leadId, mode, consultantUid, start[, customerTz]}
// -> 200 {success, id, consultantUid, consultantName, start, mode[, customerTz][, duplicate]}
//  | 409 {error: 'slot_taken'} | 400 {error: 'slot_unavailable'[, reason: 'too_far']}.
// `start` is an absolute instant. The booking stores it with the customer's
// zone (the lead's state's, else customerTz from the body when it is a US
// zone from the list, else the consultant's) and the consultant's zone, for the notices.
// A slot must start within the booking window: through the 14th calendar day
// after today in the customer's zone.
// ONE active booking per lead: when lead.bookingId already holds a live
// (not cancelled) booking, any POST for that lead answers that booking with
// duplicate: true, whatever slot or consultant it asked for, and sends nothing
// (the 3C Doors app retries after a lost response, possibly on the next
// consultant). Otherwise the slot must start at least 2 hours out and still be
// open. The slot doc id is `${consultantUid}_${startISO}`, created in one
// transaction with the lead's bookingId/status stamp, so two leads racing for
// one slot get exactly one booking (the other 409s), and two requests for one
// lead get one booking. A fresh booking sends the lead alert (once per lead,
// see lib/solar/leadAlert.ts). Cancelling (PATCH bookings/{id}) frees both.
// A lead closed at pre-qualification (noSaleReason 'low_credit') 409s.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const limited = userRateLimited('formSubmit', gate.uid);
    if (limited) return limited;
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
    const consultantUid = typeof body?.consultantUid === 'string' ? body.consultantUid.trim() : '';
    const mode = body?.mode;
    const startDate = typeof body?.start === 'string' ? new Date(body.start) : null;
    if (!LEAD_ID_RE.test(leadId) || !/^[A-Za-z0-9_-]{1,128}$/.test(consultantUid)) {
      return NextResponse.json({ error: 'leadId and consultantUid are required' }, { status: 400 });
    }
    if (!isSolarMode(mode)) return NextResponse.json({ error: 'mode must be virtual or in_person' }, { status: 400 });
    if (!startDate || Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start' }, { status: 400 });
    }
    const start = startDate.toISOString();
    // Only a US zone from the list; the lead's state still wins (see below).
    const askedTz = isUsTimeZone(body?.customerTz) ? body.customerTz : '';

    const leadRef = db.collection('solarLeads').doc(leadId);
    const lead = await leadRef.get();
    if (!lead.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (lead.get('repUid') !== gate.uid && !gate.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Closed at pre-qualification (Under 600): pick a credit tier first, which reopens it.
    if (isLowCreditDecline((lead.data() ?? {}) as Record<string, unknown>)) {
      return NextResponse.json({ error: "This homeowner didn't pre-qualify. Change the credit answer first." }, { status: 409 });
    }

    // A retry after success answers the booking it made, before the slot checks
    // (its own booking now fills the slot it asked for).
    const heldId = typeof lead.get('bookingId') === 'string' ? (lead.get('bookingId') as string) : '';
    if (heldId) {
      const held = await db.collection('solarBookings').doc(heldId).get();
      if (held.exists && held.get('status') !== 'cancelled') {
        return NextResponse.json(bookedBody(heldId, held.data() ?? {}, true));
      }
    }

    // The slot must be inside the booking window, one the consultant offers in
    // this mode, and still open.
    const now = new Date();
    const availability = (await loadAvailability()).filter((a) => a.consultantUid === consultantUid);
    const consultantTz = availability[0]?.tz || LEGACY_TZ;
    // The lead's state decides the zone (so the 14-day window can't be widened
    // from the client); a US-zone customerTz only fills in for a lead without one.
    const customerTz = zoneForState(lead.get('state')) || askedTz || consultantTz;
    if (!withinBookingWindow(startDate, now, customerTz)) {
      return NextResponse.json(
        { error: 'slot_unavailable', reason: 'too_far', message: `Book within ${SOLAR_MAX_DAYS_OUT} days.` },
        { status: 400 }
      );
    }
    const windowEnd = new Date(startDate.getTime() + 60_000);
    const offered = openSlots(availability, [], mode, startDate, windowEnd, now).find((s) => s.start === start);
    if (!offered) return NextResponse.json({ error: 'slot_unavailable' }, { status: 400 });
    const bookings = await loadBookings(startDate, new Date(startDate.getTime() + 86_400_000));
    const open = openSlots(availability, bookings, mode, startDate, windowEnd, now).some((s) => s.start === start);
    if (!open) return NextResponse.json(SLOT_TAKEN, { status: 409 });

    const id = bookingDocId(consultantUid, start);
    const slotRef = db.collection('solarBookings').doc(id);
    let outcome:
      | { fresh: true; booking: Record<string, unknown>; customerPhone: string }
      | { fresh: false; id: string; booking: Record<string, unknown> };
    try {
      outcome = await db.runTransaction(async (tx) => {
        // Every read before any write.
        const leadNow = await tx.get(leadRef);
        if (!leadNow.exists) throw new Answer({ error: 'Lead not found' }, 404);
        const nowHeld = typeof leadNow.get('bookingId') === 'string' ? (leadNow.get('bookingId') as string) : '';
        const heldSnap = nowHeld ? await tx.get(db.collection('solarBookings').doc(nowHeld)) : null;
        const slot = await tx.get(slotRef);
        if (heldSnap?.exists && heldSnap.get('status') !== 'cancelled') {
          return { fresh: false as const, id: nowHeld, booking: heldSnap.data() ?? {} };
        }
        if (slot.exists && slot.get('status') !== 'cancelled') throw new Answer(SLOT_TAKEN, 409);

        const customerName = `${leadNow.get('first') ?? ''} ${leadNow.get('last') ?? ''}`.trim();
        const customerEmail = typeof leadNow.get('email') === 'string' ? (leadNow.get('email') as string) : '';
        // What the confirmation and later views show, as it was at booking time.
        const meetLink = availability[0]?.meetLink ?? '';
        const consultantPhone = availability[0]?.phone ?? '';
        const customerAddress = addressOf(leadNow);
        const booking: Record<string, unknown> = {
          leadId,
          mode,
          consultantUid,
          consultantName: offered.name,
          start,
          end: offered.end,
          startAt: startDate,
          endAt: new Date(offered.end),
          customerTz,
          consultantTz,
          repUid: gate.uid,
          repName: gate.name,
          customerName,
          customerEmail,
          ...(meetLink ? { consultantMeetLink: meetLink } : {}),
          ...(consultantPhone ? { consultantPhone } : {}),
          ...(customerAddress ? { customerAddress } : {}),
          status: 'booked',
          createdAt: now,
        };
        if (slot.exists) {
          // A cancelled booking held this slot: keep it as history under its
          // own id, then take the slot.
          tx.set(db.collection('solarBookings').doc(`${id}_cancelled_${now.getTime()}`), slot.data() ?? {});
          tx.set(slotRef, booking);
        } else {
          tx.create(slotRef, booking);
        }
        tx.update(leadRef, { status: 'booked', bookingId: id, updatedAt: now });
        const customerPhone = typeof leadNow.get('phone') === 'string' ? (leadNow.get('phone') as string).trim() : '';
        return { fresh: true as const, booking, customerPhone };
      });
    } catch (error) {
      if (error instanceof Answer) return NextResponse.json(error.body, { status: error.status });
      if (isAlreadyExists(error)) return NextResponse.json(SLOT_TAKEN, { status: 409 });
      throw error;
    }
    if (!outcome.fresh) return NextResponse.json(bookedBody(outcome.id, outcome.booking, true));

    const b = outcome.booking;
    await announceBooking({
      id,
      leadId,
      mode,
      start,
      end: offered.end,
      consultantUid,
      consultantName: offered.name,
      meetLink: String(b.consultantMeetLink ?? ''),
      consultantPhone: String(b.consultantPhone ?? ''),
      customerName: String(b.customerName ?? ''),
      customerEmail: String(b.customerEmail ?? ''),
      customerPhone: outcome.customerPhone,
      address: String(b.customerAddress ?? ''),
      repName: gate.name,
      customerTz: String(b.customerTz ?? consultantTz),
      consultantTz,
    });
    await sendLeadAlertOnce(leadId).catch((error) => console.error('solar lead alert failed:', error));
    return NextResponse.json(bookedBody(id, b, false));
  } catch (error) {
    console.error('Error booking solar consult:', error);
    return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
  }
}
