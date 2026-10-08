import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { DRAFT_PLANS } from '@/lib/sales/knockDrafts';

// GET /api/portal/sales/plans - the internet plans a rep can sell, for 3C Doors'
// "Add details" picker. Same catalog as the Log sale form; extras (TV, phone
// lines) are added on Log sale when the rep finishes the sale.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const plans = DRAFT_PLANS.map(({ id, company, name }) => ({ id, company, name }));
  return NextResponse.json({ plans });
}
