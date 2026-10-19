import { NextRequest, NextResponse } from 'next/server';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { readClientId } from '@/lib/forms/idempotency';
import { userRateLimited } from '@/lib/userRateLimits';
import { requireSolarUser } from '@/lib/solar/server';
import { parseLead } from '@/lib/solar/leadFields';

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
