// Google free/busy for solar slots. A connected consultant's busy times on
// their primary calendar are added to the taken list openSlots reads, so
// homeowners only see times the consultant is free. The portal's own booking
// events show up as busy too; those slots are already taken by the booking
// itself, and a slot covered twice is simply gone once. Any Google error means
// no filtering (the slots stand as the portal sees them). Server only.
import type { SolarAvailability, SolarBookingLike } from '@/lib/solar/availability';
import { queryFreeBusy, type BusyInterval } from './calendar';
import { usesGoogleFreeBusy } from './status';

/** How long one consultant's free/busy answer is reused. */
export const FREEBUSY_TTL_MS = 60_000;
/** The status the added entries carry (not 'cancelled', so they block). */
export const GOOGLE_BUSY = 'google_busy';

const cache = new Map<string, { at: number; from: number; to: number; busy: BusyInterval[] }>();

/** Tests only. */
export function resetFreeBusyCache(): void {
  cache.clear();
}

async function busyFor(uid: string, from: Date, to: Date, now: number): Promise<BusyInterval[] | null> {
  const hit = cache.get(uid);
  if (hit && now - hit.at < FREEBUSY_TTL_MS && hit.from <= from.getTime() && hit.to >= to.getTime()) return hit.busy;
  const busy = await queryFreeBusy(uid, from, to);
  if (busy) cache.set(uid, { at: now, from: from.getTime(), to: to.getTime(), busy });
  return busy;
}

/**
 * Busy blocks for every consultant who connected Google with free/busy, as
 * bookings openSlots can read. Consultants Google can't answer for add nothing.
 */
export async function googleBusyBlocks(
  consultants: SolarAvailability[],
  from: Date,
  to: Date,
  now: number = Date.now()
): Promise<SolarBookingLike[]> {
  const connected = consultants.filter((c) => usesGoogleFreeBusy(c.googleCalendar));
  const lists = await Promise.all(
    connected.map(async (c) => {
      const busy = await busyFor(c.consultantUid, from, to, now).catch(() => null);
      return (busy ?? []).map((b) => ({
        consultantUid: c.consultantUid,
        start: new Date(b.start).toISOString(),
        end: new Date(b.end).toISOString(),
        status: GOOGLE_BUSY,
      }));
    })
  );
  return lists.flat();
}

/**
 * Booking-time re-check, never cached: true when the consultant's Google
 * calendar is now busy anywhere in [start, end). False when not connected,
 * free/busy wasn't granted, or Google didn't answer.
 */
export async function googleSlotBusy(consultant: SolarAvailability | undefined, start: Date, end: Date): Promise<boolean> {
  if (!consultant || !usesGoogleFreeBusy(consultant.googleCalendar)) return false;
  const busy = await queryFreeBusy(consultant.consultantUid, start, end).catch(() => null);
  if (!busy) return false;
  return busy.some((b) => b.start < end.getTime() && b.end > start.getTime());
}
