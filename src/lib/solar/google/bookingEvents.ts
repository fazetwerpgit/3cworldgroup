// Solar bookings on the consultant's Google Calendar: create after the booking
// commits, delete when it's cancelled, follow a homeowner contact fix. All of
// it runs outside Firestore transactions and is best effort: Google being down
// or disconnected never fails a booking or a cancel. Server only.
//
// solarBookings/{id} gains:
//   googleEventId    the event on the consultant's primary calendar
//   googleMeetLink   the Meet link Google made for it (virtual only)
//   googleEventState 'confirmed' | 'unconfirmed' (the insert got no answer;
//                    kept so a cancel still tries to delete it)
import { adminDb } from '@/lib/firebase/admin';
import { deleteBookingEvent, insertBookingEvent, patchBookingEventContact, type BookingEventInput } from './calendar';
import { usesGoogleCalendar, type GoogleCalendarStatus } from './status';

const BOOKINGS = 'solarBookings';
/**
 * The whole Google step of a booking (token refresh, insert, Meet read-back)
 * gets this long; past it the booking goes out with the .ics emails instead.
 * Only the quiet clean-up of a maybe-created event runs past it (3s more).
 */
export const GOOGLE_BOOKING_BUDGET_MS = 10_000;

export interface GoogleBookingEvent {
  eventId: string;
  /** '' for in-person bookings, or when Google didn't make one. */
  meetLink: string;
}

/**
 * Creates the Google event for a booking that just committed and saves its id
 * (and Meet link) on the booking. Null when the consultant isn't connected or
 * Google failed: the caller sends today's emails with the .ics then. When the
 * booking was cancelled while Google answered, the event is deleted again.
 */
export async function addBookingToGoogle(
  consultantUid: string,
  status: GoogleCalendarStatus | undefined,
  input: BookingEventInput,
  budgetMs = GOOGLE_BOOKING_BUDGET_MS
): Promise<GoogleBookingEvent | null> {
  if (!usesGoogleCalendar(status) || !adminDb) return null;
  const db = adminDb;
  const ref = db.collection(BOOKINGS).doc(input.bookingId);
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), budgetMs);
  try {
    const created = await insertBookingEvent(consultantUid, input, budget.signal);
    if (!created.ok) {
      if (created.maybeCreated) {
        // Google may have made it after all: take it down quietly
        // (sendUpdates=none), so the homeowner doesn't get an invite, then a
        // cancellation, then our .ics. Remember the id for a cancel if it stays.
        const gone = await deleteBookingEvent(consultantUid, created.eventId, 3000, { quiet: true });
        if (!gone) await ref.update({ googleEventId: created.eventId, googleEventState: 'unconfirmed' }).catch(() => {});
      }
      return null;
    }
    const kept = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('status') === 'cancelled') return false;
      tx.update(ref, {
        googleEventId: created.eventId,
        googleEventState: 'confirmed',
        ...(created.meetLink ? { googleMeetLink: created.meetLink } : {}),
      });
      return true;
    });
    if (!kept) {
      await deleteBookingEvent(consultantUid, created.eventId);
      return null;
    }
    return { eventId: created.eventId, meetLink: created.meetLink };
  } catch (error) {
    console.error('google calendar: booking event failed', error instanceof Error ? error.message : '');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Deletes a cancelled booking's event (Google emails the homeowner the cancellation). Never throws. */
export async function removeBookingFromGoogle(consultantUid: string, eventId: string): Promise<boolean> {
  if (!consultantUid || !eventId) return false;
  try {
    return await deleteBookingEvent(consultantUid, eventId);
  } catch (error) {
    console.error('google calendar: cancel delete failed', error instanceof Error ? error.message : '');
    return false;
  }
}

/** A homeowner name/email fix on a booked lead, carried to the event. Never throws. */
export async function syncBookingContactToGoogle(
  consultantUid: string,
  eventId: string,
  contact: { customerName: string; customerEmail: string }
): Promise<boolean> {
  if (!consultantUid || !eventId) return false;
  try {
    return await patchBookingEventContact(consultantUid, eventId, contact);
  } catch (error) {
    console.error('google calendar: contact sync failed', error instanceof Error ? error.message : '');
    return false;
  }
}
