import { NextRequest, NextResponse } from 'next/server';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { readClientId } from '@/lib/forms/idempotency';
import { userRateLimited } from '@/lib/userRateLimits';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { permissionsFor } from '@/types/auth';
import { loadAvailability, requireSolarUser } from '@/lib/solar/server';
import { parseLead } from '@/lib/solar/leadFields';
import { DEFAULT_CONSULTANT_TZ } from '@/lib/solar/timezones';
import { DEMO_ACCOUNT_FIELD } from '@/lib/users/demoAccount';
import { bookingView, leadView, type SolarLeadBooking } from '@/lib/solar/leadView';

// GET /api/portal/solar/leads -> 200 {leads: SolarLeadView[]}, newest first,
// each with its live booking joined (booking: null when there is none or it
// was cancelled). An admin (or the owner) gets every lead but demo accounts';
// anyone else with solar:read gets only their own. ?mine=1 asks for one's own
// leads as an admin too (the rep Solar page's My leads).
export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!permissionsFor(gate).includes('solar:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const all = gate.isAdmin && request.nextUrl.searchParams.get('mine') !== '1';
    const leads = all
      ? db.collection('solarLeads')
      : db.collection('solarLeads').where('repUid', '==', gate.uid);
    const snap = await leads.get();
    const docs = snap.docs
      .map((d) => ({ id: d.id, data: (d.data() ?? {}) as Record<string, unknown> }))
      .filter(({ data }) => !all || data[DEMO_ACCOUNT_FIELD] !== true);

    const bookingIds = [
      ...new Set(docs.map(({ data }) => (typeof data.bookingId === 'string' ? data.bookingId : '')).filter(Boolean)),
    ];
    const [bookingSnaps, availability] = await Promise.all([
      Promise.all(bookingIds.map((id) => db.collection('solarBookings').doc(id).get())),
      bookingIds.length ? loadAvailability().catch(() => []) : Promise.resolve([]),
    ]);
    const tzOf = new Map(availability.map((a) => [a.consultantUid, a.tz]));
    const bookings = new Map<string, SolarLeadBooking | null>();
    for (const b of bookingSnaps) {
      const data = b.exists ? ((b.data() ?? {}) as Record<string, unknown>) : undefined;
      const tz = tzOf.get(String(data?.consultantUid ?? '')) ?? DEFAULT_CONSULTANT_TZ;
      bookings.set(b.id, bookingView(b.id, data, tz));
    }

    const views = docs.map(({ id, data }) =>
      leadView(id, data, typeof data.bookingId === 'string' ? (bookings.get(data.bookingId) ?? null) : null)
    );
    views.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return NextResponse.json({ leads: views }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error listing solar leads:', error);
    return NextResponse.json({ error: 'Failed to load solar leads' }, { status: 500 });
  }
}

// POST /api/portal/solar/leads - a rep (portal deck or 3C Doors) submits a solar lead.
// Body: {clientId?, first, last, address, city, state, zip, phone, email,
//   monthlyBill, creditTier?, uploadId?, photos?{billPage1,billGraph,panel}, doorId?, campaignId?}
// -> 200 {success, id}. Idempotent on clientId / Idempotency-Key: a resend
// answers the first lead's id. No alert here: the one lead alert goes out when
// the appointment is set (POST bookings) or the rep finishes without booking
// (POST leads/{id}/finish).
export async function POST(request: NextRequest) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const limited = userRateLimited('formSubmit', gate.uid);
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const idem = readClientId(body, request.headers);
    if (!idem.ok) return NextResponse.json({ error: idem.error }, { status: 400 });
    const parsed = parseLead(body as Record<string, unknown>, gate.uid);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { id } = await submitFormRecord(
      'solarLeads',
      { uid: gate.uid, name: gate.name, email: gate.email },
      parsed.fields,
      { clientId: idem.clientId }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting solar lead:', error);
    return NextResponse.json({ error: 'Failed to submit solar lead' }, { status: 500 });
  }
}
