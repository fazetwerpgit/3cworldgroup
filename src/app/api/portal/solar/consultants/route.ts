import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { loadConsultants } from '@/lib/solar/server';

// GET /api/portal/solar/consultants -> 200 {consultants, seeded}. Admin only
// (Admin > Solar > Setup). `seeded` is true while nothing has been saved yet and
// the list is the built-in seed (owner + Jacob): the first PUT writes all of it.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json(await loadConsultants());
  } catch (error) {
    console.error('Error loading solar consultants:', error);
    return NextResponse.json({ error: 'Failed to load consultants' }, { status: 500 });
  }
}
