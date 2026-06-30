import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireManagement } from '@/lib/auth/requireManagement';
import { reviewQuery } from '@/lib/forms/reviewQuery';

const COLLECTION = 'expediteOrders';

export async function GET(request: NextRequest) {
  const result = await reviewQuery(COLLECTION, request.nextUrl.searchParams.get('requestedBy'));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const body = await request.json();
    const gate = await requireManagement(body.requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const ref = adminDb.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (doc.data()?.status !== 'new') {
      return NextResponse.json({ error: 'Already handled' }, { status: 400 });
    }
    await ref.update({ status: 'handled', handledBy: gate.requester.uid, updatedAt: new Date() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating expedite order:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
