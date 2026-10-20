import { NextRequest, NextResponse } from 'next/server';
import { isSolarMode, openSlots, orderByPreference } from '@/lib/solar/availability';
import { loadAvailability, loadBookings, requireSolarUser, resolveConsultants } from '@/lib/solar/server';
import { bookingWindowEnd, SOLAR_MAX_DAYS_OUT } from '@/lib/solar/timezones';

const DAY = 86_400_000;

// GET /api/portal/solar/availability?mode=virtual|in_person&from=ISO&to=ISO
// -> 200 {slots: [{consultantUid, name, start, end}]} (ISO UTC). from defaults
// to now, to to from + 14 days. Nothing past the booking window (now + 14
// days, SOLAR_MAX_DAYS_OUT) is listed, whatever `to` asks for, and only slots
// at least 2 hours out. Times are absolute; the deck shows them in the
// customer's zone. Slots that share a start come in booking
// preference order (orderByPreference): the first is the one to book.
export async function GET(request: NextRequest) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const params = request.nextUrl.searchParams;
    const mode = params.get('mode');
    if (!isSolarMode(mode)) return NextResponse.json({ error: 'mode must be virtual or in_person' }, { status: 400 });
    const now = new Date();
    const fromRaw = params.get('from');
    const toRaw = params.get('to');
    const from = fromRaw ? new Date(fromRaw) : now;
    const to = toRaw ? new Date(toRaw) : new Date(from.getTime() + SOLAR_MAX_DAYS_OUT * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 });
    }
    const windowEnd = bookingWindowEnd(now);
    // Past the window there is nothing to list (openSlots answers [] for an empty range).
    const cappedTo = to > windowEnd ? windowEnd : to;
    if (cappedTo <= from) return NextResponse.json({ slots: [] });

    const [availability, bookings, { owner }] = await Promise.all([
      loadAvailability(),
      loadBookings(from, cappedTo),
      resolveConsultants(),
    ]);
    const slots = orderByPreference(openSlots(availability, bookings, mode, from, cappedTo, now), bookings, mode, owner?.uid ?? null);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error loading solar availability:', error);
    return NextResponse.json({ error: 'Failed to load availability' }, { status: 500 });
  }
}
