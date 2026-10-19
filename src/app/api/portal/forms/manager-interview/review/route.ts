import { NextRequest, NextResponse } from 'next/server';
import { reviewQuery, reviewField, markHandled } from '@/lib/forms/reviewQuery';

const COLLECTION = 'managerInterviews';
// Signature PNGs run up to ~270 KB each; the list leaves them out and the queue
// loads one per opened row with ?id=, so the response stays under 4.5 MB.
const SIGNATURE_FIELD = 'signatureDataUrl';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (id !== null) {
    const one = await reviewField(COLLECTION, request, id, SIGNATURE_FIELD);
    if (!one.ok) return NextResponse.json({ error: one.error }, { status: one.status });
    return NextResponse.json({ id, signatureDataUrl: typeof one.value === 'string' ? one.value : null });
  }
  const result = await reviewQuery(COLLECTION, request, [SIGNATURE_FIELD]);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const result = await markHandled(COLLECTION, request, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating manager interview:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
