import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { userRateLimited } from '@/lib/userRateLimits';
import { isAlreadyExists } from '@/lib/forms/idempotency';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, managerAlertEmail, solarBookingConfirmationEmail } from '@/lib/email/templates';
import { bookingDocId, isSolarMode, openSlots, type SolarMode } from '@/lib/solar/availability';
import { consultantNotice, loadAvailability, loadBookings, loadContacts, requireSolarUser } from '@/lib/solar/server';
import { sendLeadAlertOnce } from '@/lib/solar/leadAlert';
import { isLowCreditDecline } from '@/lib/solar/leadFields';
import { isSoldLead } from '@/lib/solar/closePermission';
import { consultantBookingAttachment, customerBookingAttachment, type BookingInviteInput } from '@/lib/solar/bookingInvite';
import { solarLeadHref } from '@/lib/solar/leadView';
import { addBookingToGoogle, type GoogleBookingEvent } from '@/lib/solar/google/bookingEvents';
import { googleSlotBusy } from '@/lib/solar/google/freeBusy';
import { bookingAudience, isTestAccountUid, type BookingAudience } from '@/lib/solar/testAccount';
import { TEST_ACCOUNT_FIELD, isTestAccount } from '@/lib/users/demoAccount';
import {
  LEGACY_TZ,
  SOLAR_MAX_DAYS_OUT,
  formatWhen,
  formatWhenForConsultant,
  isUsTimeZone,
  withinBookingWindow,
  zoneForState,
} from '@/lib/solar/timezones';

// Google (free/busy re-check up to ~6s, the event up to ~10s) plus the emails.
export const maxDuration = 30;

const SLOT_TAKEN = { error: 'slot_taken' };
const LOW_CREDIT_BOOK_ERROR = "This homeowner didn't pre-qualify. Change the credit answer first.";
const SOLD_BOOK_ERROR = 'This deal is already sold.';

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
  /** The event on the consultant's Google Calendar, or null (not connected, or Google failed). */
  google: GoogleBookingEvent | null;
  /** Who the messages may reach (lib/solar/testAccount: a test booking reaches nobody real). */
  audience: BookingAudience;
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
// emails carry an .ics invite with the same UID (lib/solar/bookingInvite),
// except when the booking is on the consultant's Google Calendar: Google's
// own invite puts it on both calendars, so a second .ics would double it.
// Then the Meet link is the one Google made for the event. A notice that goes
// to someone else (Jacob, for the owner's calendar) keeps its .ics: they
// aren't on the Google event.
async function announceBooking(b: Booking) {
  const when = formatWhen(b.start, b.customerTz);
  const consultantWhen = formatWhenForConsultant(b.start, b.consultantTz, b.customerTz);
  const how = b.mode === 'virtual' ? 'virtual' : 'in-person';
  const bookedMeet = b.google?.meetLink || b.meetLink;
  const meetLink = b.mode === 'virtual' ? bookedMeet : '';
  const link = solarLeadHref(b.leadId);
  const invite: BookingInviteInput = {
    bookingId: b.id,
    mode: b.mode,
    start: b.start,
    end: b.end,
    consultantName: b.consultantName,
    meetLink: bookedMeet,
    consultantPhone: b.consultantPhone,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    address: b.address,
    leadUrl: `${appBaseUrl()}${link}`,
  };
  try {
    const notice =
      b.audience.consultant === 'normal'
        ? await consultantNotice(b.consultantUid)
        : b.audience.consultant === 'consultant'
          ? { to: (await loadContacts([b.consultantUid]))[0] ?? null, titlePrefix: '', replyTo: '' }
          : { to: null, titlePrefix: '', replyTo: '' };
    if (b.customerEmail && b.audience.homeowner) {
      await sendEmail({
        to: b.customerEmail,
        ...solarBookingConfirmationEmail({
          customerName: b.customerName,
          when,
          mode: b.mode,
          consultantName: b.consultantName,
          meetLink: bookedMeet,
          consultantPhone: b.consultantPhone,
          address: b.address,
          calendarAttached: !b.google,
          googleInvite: Boolean(b.google),
        }),
        ...(notice.replyTo ? { replyTo: notice.replyTo } : {}),
        ...(b.google ? {} : { attachments: [customerBookingAttachment(invite)] }),
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
        ...(b.google && to.uid === b.consultantUid ? {} : { attachments: [consultantBookingAttachment(invite)] }),
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

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * The 200 body for a booking: the real one, so a retrying app shows what was booked.
 * Virtual only: the consultant's own Meet link (snapshotted on the booking) and the
 * one Google made for the event (fresh: from addBookingToGoogle; duplicate: the
 * stored googleMeetLink), each only when non-empty.
 */
function bookedBody(
  id: string,
  b: Record<string, unknown>,
  duplicate: boolean,
  googleMeetLink: unknown = b.googleMeetLink
) {
  const virtual = b.mode === 'virtual';
  return {
    success: true,
    id,
    ...(duplicate ? { duplicate: true } : {}),
    consultantUid: String(b.consultantUid ?? ''),
    consultantName: String(b.consultantName ?? ''),
    start: String(b.start ?? ''),
    mode: b.mode === 'virtual' ? 'virtual' : 'in_person',
    ...(typeof b.customerTz === 'string' && b.customerTz ? { customerTz: b.customerTz } : {}),
    ...(virtual && nonEmpty(b.consultantMeetLink) ? { consultantMeetLink: b.consultantMeetLink } : {}),
    ...(virtual && nonEmpty(googleMeetLink) ? { googleMeetLink } : {}),
  };
}

// POST /api/portal/solar/bookings {leadId, mode, consultantUid, start[, customerTz]}
// -> 200 {success, id, consultantUid, consultantName, start, mode[, customerTz][, duplicate]
//          [, consultantMeetLink][, googleMeetLink]}
//  | 409 {error: 'slot_taken'} | 400 {error: 'slot_unavailable'[, reason: 'too_far']}.
// The Meet links come only for a virtual booking, each only when set:
// consultantMeetLink is the consultant's own room snapshotted at booking time;
// googleMeetLink is the one Google made for the event (consultant on Google
// Calendar and the event made; a duplicate answers the stored one).
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
// Google Calendar (lib/solar/google), for a consultant who connected it: the
// slot is re-checked against their free/busy (busy -> 409 slot_taken), and
// after the commit the booking goes on their calendar with the homeowner
// invited by Google (googleEventId / googleMeetLink saved on the booking).
// Google failing never fails the booking; the emails fall back to the .ics.
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
      return NextResponse.json({ error: LOW_CREDIT_BOOK_ERROR }, { status: 409 });
    }
    // A sold deal takes no new consultation: booking would set it back to 'booked'.
    if (isSoldLead(lead.data() ?? {})) return NextResponse.json({ error: SOLD_BOOK_ERROR }, { status: 409 });

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
    // Their Google Calendar, asked fresh (no cache): busy there since the list
    // loaded is taken too. Google not answering doesn't block the booking.
    if (await googleSlotBusy(availability[0], startDate, new Date(offered.end))) {
      return NextResponse.json(SLOT_TAKEN, { status: 409 });
    }

    // A QA test account's booking (or one on its lead) is stamped and reaches
    // nobody real: no homeowner email, no Google event, and the consultant's
    // notice only when the consultant is a test account too.
    const testRecord = gate.testAccount === true || isTestAccount(lead.data());
    const audience = bookingAudience(testRecord, testRecord && (await isTestAccountUid(consultantUid)));

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
        // Re-check: the lead may have been declined since the pre-check above.
        if (isLowCreditDecline((leadNow.data() ?? {}) as Record<string, unknown>)) {
          throw new Answer({ error: LOW_CREDIT_BOOK_ERROR }, 409);
        }
        // Re-check: an owner may have marked it sold since.
        if (isSoldLead(leadNow.data() ?? {})) throw new Answer({ error: SOLD_BOOK_ERROR }, 409);
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
          ...(testRecord ? { [TEST_ACCOUNT_FIELD]: true } : {}),
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
    // After the commit, outside the transaction: the Google event (best
    // effort, ~10s budget; null falls back to the .ics emails).
    const google = !audience.google ? null : await addBookingToGoogle(consultantUid, availability[0]?.googleCalendar, {
      bookingId: id,
      createdAtMs: now.getTime(),
      mode,
      start,
      end: offered.end,
      timeZone: consultantTz,
      customerName: String(b.customerName ?? ''),
      customerEmail: String(b.customerEmail ?? ''),
      address: String(b.customerAddress ?? ''),
      consultantName: offered.name,
      consultantPhone: String(b.consultantPhone ?? ''),
    });
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
      google,
      audience,
    });
    await sendLeadAlertOnce(leadId).catch((error) => console.error('solar lead alert failed:', error));
    return NextResponse.json(bookedBody(id, b, false, google?.meetLink));
  } catch (error) {
    console.error('Error booking solar consult:', error);
    return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
  }
}
