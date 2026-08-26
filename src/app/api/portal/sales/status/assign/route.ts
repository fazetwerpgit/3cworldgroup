import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { assignDealerToUser } from '@/lib/fiberReport/assignDealer';
import { rematchUnmatchedOrders } from '@/lib/fiberReport/rematch';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const callerDoc = await adminDb.collection('users').doc(gate.uid).get();
    if (!callerDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const callerData = callerDoc.data() ?? {};
    if (callerData.role !== 'admin' && callerData.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!isRecord(body) || typeof body.action !== 'string') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body.action === 'assign') {
      if (typeof body.dealerId !== 'string' || typeof body.userId !== 'string') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }
      const result = await assignDealerToUser(body.dealerId, body.userId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ ok: true, updated: result.updated });
    }

    if (body.action === 'rematch') {
      const result = await rematchUnmatchedOrders();
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('Error assigning fiber status:', error);
    return NextResponse.json({ error: 'Failed to assign fiber status' }, { status: 500 });
  }
}
