import { NextRequest, NextResponse } from 'next/server';
import { requireSelfOrManagement } from '@/lib/auth/requireManagement';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { EXPEDITE_REASONS, isValidOption } from '@/lib/forms/formOptions';
import { validateAddress } from '@/lib/validation/address';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/expedite-order - a logged-in rep requests an expedite.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedBy = s(body.requestedBy, 128);

    const gate = await requireSelfOrManagement(requestedBy, requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const addr = validateAddress({ address: body.address, city: body.city, state: body.state, zip: body.zip });
    if (!addr.ok) return NextResponse.json({ error: addr.error }, { status: 400 });

    const reason = s(body.reason, 80);
    const fields = {
      customerName: s(body.customerName, 180),
      customerPhone: s(body.customerPhone, 40),
      customerEmail: s(body.customerEmail, 180),
      ...addr.clean,
      orderNumber: s(body.orderNumber, 120),
      expediteDates: s(body.expediteDates, 300),
      reason: isValidOption(EXPEDITE_REASONS, reason) ? reason : '',
    };

    const { id } = await submitFormRecord('expediteOrders', gate.requester.uid, fields);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting expedite order:', error);
    return NextResponse.json({ error: 'Failed to submit expedite order' }, { status: 500 });
  }
}
