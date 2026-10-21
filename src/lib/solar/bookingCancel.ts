// Cancelling a solar booking: the transaction writes (shared by PATCH
// bookings/{id}, PATCH leads/{id} {status:'lost'} / {noSaleReason}, and the
// stage route) and what follows the commit: the notices and the Google
// Calendar event's delete. Server only (admin SDK).
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { bookingZones, formatWhen, formatWhenForConsultant } from '@/lib/solar/timezones';
import { solarLeadHref } from '@/lib/solar/leadView';
import { consultantNotice, ownerNotificationsEnabled, resolveConsultants } from '@/lib/solar/server';
import { removeBookingFromGoogle } from '@/lib/solar/google/bookingEvents';
import { sendEmail } from '@/lib/email/sendEmail';
import { appBaseUrl, managerAlertEmail, solarBookingCancelledEmail } from '@/lib/email/templates';
import {
  consultantBookingCancelAttachment,
  customerBookingCancelAttachment,
  type BookingCancelInput,
} from '@/lib/solar/bookingInvite';

type Data = Record<string, unknown>;
type Snap = { exists: boolean; get: (field: string) => unknown; data: () => Data | undefined };
// The transaction methods used here, typed loosely so the admin SDK's
// Transaction and the test fakeDb both fit.
type Tx = { update: (ref: never, data: Data) => unknown };

/** What the notices need from a booking that was just cancelled. */
export interface CancelledBooking {
  id: string;
  leadId: string;
  consultantUid: string;
  consultantName: string;
  repUid: string;
  customerName: string;
  start: string;
  /** UTC ISO end; '' on a booking without one (the cancel .ics then assumes an hour). */
  end: string;
  /** The homeowner's email as booked (who got the confirmation); '' when none. */
  customerEmail: string;
  mode: 'virtual' | 'in_person';
  /** The booking's zones (old bookings: consultant America/Chicago, customer the same). */
  consultantTz: string;
  customerTz: string;
  /** The booking's event on the consultant's Google Calendar ('' when none). */
  googleEventId: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** True when the booking doc exists and still holds its slot. */
export function isLiveBooking(booking: Snap | null | undefined): boolean {
  return !!booking?.exists && booking.get('status') !== 'cancelled';
}

/**
 * Stage a live booking's cancel in `tx` (call it after every read). The
 * booking reads 'cancelled', so its slot opens again (openSlots skips cancelled
 * bookings and POST bookings may take the slot over). The lead lets go of it
 * when it still points at this booking: bookingId cleared, and a 'booked'
 * lead goes back to 'new'. `leadPatch` is merged into that same lead write
 * (Mark lost sets its status there).
 */
export function stageBookingCancel(
  tx: Tx,
  args: {
    id: string;
    bookingRef: unknown;
    booking: Snap;
    leadRef: unknown;
    lead: Snap | null;
    by: string;
    now: Date;
    leadPatch?: Data;
  }
): CancelledBooking {
  const { id, booking, lead, by, now, leadPatch } = args;
  const zones = bookingZones({ consultantTz: booking.get('consultantTz'), customerTz: booking.get('customerTz') });
  tx.update(args.bookingRef as never, { status: 'cancelled', cancelledAt: now, cancelledBy: by });
  if (args.leadRef && lead?.exists && lead.get('bookingId') === id) {
    tx.update(args.leadRef as never, {
      bookingId: null,
      ...(lead.get('status') === 'booked' ? { status: 'new' } : {}),
      updatedAt: now,
      ...leadPatch,
    });
  }
  return {
    id,
    leadId: str(booking.get('leadId')),
    consultantUid: str(booking.get('consultantUid')),
    consultantName: str(booking.get('consultantName')) || 'the consultant',
    repUid: str(booking.get('repUid')),
    customerName: str(booking.get('customerName')),
    start: str(booking.get('start')),
    end: str(booking.get('end')),
    customerEmail: str(booking.get('customerEmail')).trim(),
    mode: booking.get('mode') === 'virtual' ? 'virtual' : 'in_person',
    ...zones,
    googleEventId: str(booking.get('googleEventId')),
  };
}

const HOUR = 3_600_000;

/** The cancel .ics input; null when the booking has no usable start. */
function cancelInvite(c: CancelledBooking): BookingCancelInput | null {
  const start = Date.parse(c.start);
  if (Number.isNaN(start)) return null;
  const end = Date.parse(c.end);
  return {
    bookingId: c.id,
    start: new Date(start).toISOString(),
    end: new Date(Number.isNaN(end) || end <= start ? start + HOUR : end).toISOString(),
    consultantName: c.consultantName,
    customerName: c.customerName,
  };
}

/**
 * After the cancel commits (every cancel path calls this): the booking's
 * Google Calendar event is deleted with sendUpdates=all, so Google emails the
 * homeowner the cancellation (best effort, lib/solar/google/bookingEvents).
 *
 * Without a Google event the confirmation carried our own .ics, so the cancel
 * emails one back with METHOD:CANCEL (same UID, SEQUENCE 1): to the homeowner
 * (when they have an email on the booking) and to whoever got the booking
 * notice's .ics (the consultant, or Jacob for the owner's calendar). This
 * mirrors announceBooking: a Google-connected consultant gets no .ics either
 * way, but Jacob's owner-calendar copy always carried one, so it is always
 * cancelled. These go out even when the reader cancelled it themselves: the
 * calendar entry still has to go.
 *
 * The cancel notice: a portal notification plus a best-effort push to the rep
 * who booked it and to the consultant. The owner rule holds (see
 * consultantNotice): while settings/solar.notifyOwner is off the owner gets
 * nothing, and the owner's own consultations notify Jacob as
 * "[Owner's calendar]". Whoever cancelled gets no portal notification or
 * push. Never throws.
 */
export async function announceBookingCancel(
  c: CancelledBooking,
  cancelledBy: string,
  reason: 'cancelled' | 'lost' = 'cancelled'
): Promise<void> {
  const google = c.googleEventId ? removeBookingFromGoogle(c.consultantUid, c.googleEventId) : Promise.resolve(false);
  try {
    const [notice, notifyOwner, { owner }] = await Promise.all([
      c.consultantUid ? consultantNotice(c.consultantUid) : Promise.resolve(null),
      ownerNotificationsEnabled(),
      resolveConsultants(),
    ]);
    const how = c.mode === 'virtual' ? 'virtual' : 'in-person';
    const who = c.customerName || 'A customer';
    const why = reason === 'lost' ? ' The lead was marked lost.' : '';
    // The consultant reads the time in their zone, the rep in the customer's.
    const messageAt = (when: string) => `${who}: ${how}, ${when} with ${c.consultantName}. The time is open again.${why}`;
    const consultantMessage = messageAt(c.start ? formatWhenForConsultant(c.start, c.consultantTz, c.customerTz) : 'its time');
    const repMessage = messageAt(c.start ? formatWhen(c.start, c.customerTz) : 'its time');

    const sends = new Map<string, { title: string; link: string; message: string }>();
    if (notice?.to) {
      sends.set(notice.to.uid, {
        title: `${notice.titlePrefix}Solar consult cancelled`,
        link: solarLeadHref(c.leadId),
        message: consultantMessage,
      });
    }
    if (c.repUid && !sends.has(c.repUid)) {
      sends.set(c.repUid, { title: 'Solar consult cancelled', link: '/portal/solar', message: repMessage });
    }
    sends.delete(cancelledBy);
    if (!notifyOwner && owner) sends.delete(owner.uid);

    const invite = cancelInvite(c);
    const onGoogle = Boolean(c.googleEventId);
    if (invite && !onGoogle && c.customerEmail) {
      await sendEmail({
        to: c.customerEmail,
        ...solarBookingCancelledEmail({
          customerName: c.customerName,
          when: formatWhen(c.start, c.customerTz),
          mode: c.mode,
          consultantName: c.consultantName,
        }),
        ...(notice?.replyTo ? { replyTo: notice.replyTo } : {}),
        attachments: [customerBookingCancelAttachment(invite)],
        tag: 'solar-booking',
      }).catch((error) => console.error('solar cancel email (homeowner) failed:', error));
    }
    const to = notice?.to;
    if (notice && invite && to?.email && !(onGoogle && to.uid === c.consultantUid)) {
      const title = `${notice.titlePrefix}Solar consult cancelled`;
      await sendEmail({
        to: to.email,
        ...managerAlertEmail({ title, message: consultantMessage, link: `${appBaseUrl()}${solarLeadHref(c.leadId)}` }),
        attachments: [consultantBookingCancelAttachment(invite)],
        tag: 'solar-booking',
      }).catch((error) => console.error('solar cancel email (consultant) failed:', error));
    }

    await Promise.all(
      [...sends].map(async ([uid, { title, link, message }]) => {
        await createNotification({
          userId: uid,
          type: 'solar_booking',
          title,
          message,
          link,
          metadata: { bookingId: c.id, leadId: c.leadId, cancelled: true },
        }).catch((error) => console.error('solar cancel notification failed:', error));
        await sendPushToUser(uid, { title, body: message, url: link }).catch(() => {});
      })
    );
  } catch (error) {
    console.error('solar cancel announce failed:', error);
  }
  await google;
}
