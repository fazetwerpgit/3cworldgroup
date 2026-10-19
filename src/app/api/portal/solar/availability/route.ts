import { NextRequest, NextResponse } from 'next/server';
import { isSolarMode, openSlots, orderByPreference } from '@/lib/solar/availability';
import { loadAvailability, loadBookings, requireSolarUser, resolveConsultants } from '@/lib/solar/server';

const DAY = 86_400_000;
const MAX_RANGE = 31 * DAY;

// GET /api/portal/solar/availability?mode=virtual|in_person&from=ISO&to=ISO
// -> 200 {slots: [{consultantUid, name, start, end}]} (ISO UTC). from defaults
// to now, to to from + 14 days; the range is capped at 31 days. Only slots at
// least 2 hours out are listed. Slots that share a start come in booking
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
    const to = toRaw ? new Date(toRaw) : new Date(from.getTime() + 14 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 });
    }
    const cappedTo = to.getTime() - from.getTime() > MAX_RANGE ? new Date(from.getTime() + MAX_RANGE) : to;

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
