// Cancelling a solar booking: the transaction writes (shared by PATCH
// bookings/{id} and PATCH leads/{id} {status:'lost'}) and the notices that
// follow. Server only (admin SDK).
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { formatSlotPT } from '@/lib/solar/availability';
import { solarLeadHref } from '@/lib/solar/leadView';
import { consultantNotice, ownerNotificationsEnabled, resolveConsultants } from '@/lib/solar/server';

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
  mode: 'virtual' | 'in_person';
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
    mode: booking.get('mode') === 'virtual' ? 'virtual' : 'in_person',
  };
}

/**
 * The cancel notice: a portal notification plus a best-effort push to the rep
 * who booked it and to the consultant. The owner rule holds (see
 * consultantNotice): while settings/solar.notifyOwner is off the owner gets
 * nothing, and the owner's own consultations notify Jacob as
 * "[Owner's calendar]". Whoever cancelled is never notified, and nobody is
 * emailed (the homeowner included). Never throws.
 */
export async function announceBookingCancel(
  c: CancelledBooking,
  cancelledBy: string,
  reason: 'cancelled' | 'lost' = 'cancelled'
): Promise<void> {
  try {
    const [notice, notifyOwner, { owner }] = await Promise.all([
      c.consultantUid ? consultantNotice(c.consultantUid) : Promise.resolve(null),
      ownerNotificationsEnabled(),
      resolveConsultants(),
    ]);
    const when = c.start ? `${formatSlotPT(c.start)} PT` : 'its time';
    const how = c.mode === 'virtual' ? 'virtual' : 'in-person';
    const who = c.customerName || 'A customer';
    const why = reason === 'lost' ? ' The lead was marked lost.' : '';
    const message = `${who}: ${how}, ${when} with ${c.consultantName}. The time is open again.${why}`;

    const sends = new Map<string, { title: string; link: string }>();
    if (notice?.to) {
      sends.set(notice.to.uid, { title: `${notice.titlePrefix}Solar consult cancelled`, link: solarLeadHref(c.leadId) });
    }
    if (c.repUid && !sends.has(c.repUid)) {
      sends.set(c.repUid, { title: 'Solar consult cancelled', link: '/portal/solar' });
    }
    sends.delete(cancelledBy);
    if (!notifyOwner && owner) sends.delete(owner.uid);

    await Promise.all(
      [...sends].map(async ([uid, { title, link }]) => {
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
}
