import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { EXPEDITE_REASONS, isValidOption } from '@/lib/forms/formOptions';
import { validateAddress } from '@/lib/validation/address';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/expedite-order - a logged-in rep requests an expedite.
// Auth: real Firebase ID token; stamped under the verified caller.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const addr = validateAddress({ address: body.address, city: body.city, state: body.state, zip: body.zip });
    if (!addr.ok) return NextResponse.json({ error: addr.error }, { status: 400 });

    const customerName = s(body.customerName, 180);
    const customerPhone = s(body.customerPhone, 40);
    const orderNumber = s(body.orderNumber, 120);
    const expediteDates = s(body.expediteDates, 300);
    const reason = s(body.reason, 80);

    // The page marks these required; enforce the same server-side so a crafted
    // request can't create a blank, un-actionable expedite order.
    if (!customerName || !customerPhone || !orderNumber || !expediteDates) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isValidOption(EXPEDITE_REASONS, reason)) {
      return NextResponse.json({ error: 'Select a valid reason' }, { status: 400 });
    }

    const fields = {
      customerName,
      customerPhone,
      customerEmail: s(body.customerEmail, 180),
      ...addr.clean,
      orderNumber,
      expediteDates,
      reason,
    };

    const { id } = await submitFormRecord(
      'expediteOrders',
      { uid: gate.uid, name: gate.name, email: gate.email },
      fields
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting expedite order:', error);
    return NextResponse.json({ error: 'Failed to submit expedite order' }, { status: 500 });
  }
}
