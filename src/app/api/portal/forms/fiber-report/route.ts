import { NextRequest, NextResponse } from 'next/server';
import { requireSelfOrManagement } from '@/lib/auth/requireManagement';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { FIBER_COMPANIES, isValidOption } from '@/lib/forms/formOptions';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/fiber-report - a logged-in rep submits a fiber report.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedBy = s(body.requestedBy, 128);

    const gate = await requireSelfOrManagement(requestedBy, requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const companySold = s(body.companySold, 40);
    const fields = {
      companySold: isValidOption(FIBER_COMPANIES, companySold) ? companySold : '',
      dateKnocked: s(body.dateKnocked, 40),
      packNumber: s(body.packNumber, 40),
      numberOfReps: s(body.numberOfReps, 20),
      doorsKnocked: s(body.doorsKnocked, 20),
      customerContacts: s(body.customerContacts, 20),
      numberOfSales: s(body.numberOfSales, 20),
      orderNumber: s(body.orderNumber, 120),
    };

    const { id } = await submitFormRecord('fiberReports', gate.requester.uid, fields);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting fiber report:', error);
    return NextResponse.json({ error: 'Failed to submit fiber report' }, { status: 500 });
  }
}
