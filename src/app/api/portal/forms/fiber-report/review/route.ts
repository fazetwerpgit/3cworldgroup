import { NextRequest, NextResponse } from 'next/server';
import { reviewQuery, markHandled } from '@/lib/forms/reviewQuery';

const COLLECTION = 'fiberReports';

// GET - verified-management list of fiber reports (exposes customer/rep data).
export async function GET(request: NextRequest) {
  const result = await reviewQuery(COLLECTION, request);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

// POST - mark a submission handled (verified management, new -> handled, atomic).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const result = await markHandled(COLLECTION, request, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating fiber report:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
