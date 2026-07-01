import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { isValidOption } from '@/lib/forms/formOptions';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { notifySubmission } from '@/lib/forms/notifySubmission';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/fiber-report - a logged-in rep submits a fiber report.
// Auth: real Firebase ID token (Authorization: Bearer); stamped under the verified
// caller, never a client-supplied UID.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const opts = await getResolvedFormOptions();
    const companySold = s(body.companySold, 40);
    if (companySold && !isValidOption(opts.providers, companySold)) {
      return NextResponse.json({ error: 'Select a valid company' }, { status: 400 });
    }

    const fields = {
      companySold,
      dateKnocked: s(body.dateKnocked, 40),
      packNumber: s(body.packNumber, 40),
      numberOfReps: s(body.numberOfReps, 20),
      doorsKnocked: s(body.doorsKnocked, 20),
      customerContacts: s(body.customerContacts, 20),
      numberOfSales: s(body.numberOfSales, 20),
      orderNumber: s(body.orderNumber, 120),
    };

    const { id } = await submitFormRecord(
      'fiberReports',
      { uid: gate.uid, name: gate.name, email: gate.email },
      fields
    );
    await notifySubmission('fiber-report', gate.name);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting fiber report:', error);
    return NextResponse.json({ error: 'Failed to submit fiber report' }, { status: 500 });
  }
}
