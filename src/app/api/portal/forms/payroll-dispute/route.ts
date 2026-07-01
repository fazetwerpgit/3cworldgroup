import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { PAYROLL_CAMPAIGNS, isValidOption } from '@/lib/forms/formOptions';
import { buildFormAttachmentFolder } from '@/lib/forms/formUploads';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/payroll-dispute - verified user submits a payroll dispute.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const contractorName = s(body.contractorName, 180);
    const contractorEmail = s(body.contractorEmail, 180);
    const campaign = s(body.campaign, 40);
    const typeOfOrder = s(body.typeOfOrder, 120);
    const dateOfInstall = s(body.dateOfInstall, 40);

    if (!contractorName || !contractorEmail || !typeOfOrder || !dateOfInstall) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isValidOption(PAYROLL_CAMPAIGNS, campaign)) {
      return NextResponse.json({ error: 'Select a valid campaign' }, { status: 400 });
    }

    // The screenshot path, if present, must be THIS caller's own folder.
    const screenshot = s(body.orderScreenshotPath, 300);
    const expected = buildFormAttachmentFolder(gate.uid, 'payroll-dispute');
    const orderScreenshotPath = screenshot === expected ? screenshot : '';

    const { id } = await submitFormRecord(
      'payrollDisputes',
      { uid: gate.uid, name: gate.name, email: gate.email },
      { contractorName, contractorEmail, campaign, typeOfOrder, dateOfInstall, orderScreenshotPath }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting payroll dispute:', error);
    return NextResponse.json({ error: 'Failed to submit payroll dispute' }, { status: 500 });
  }
}
