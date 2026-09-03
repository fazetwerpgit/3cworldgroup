import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { invalidateFiberOrdersCache } from '@/lib/fiberReport/ordersCache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// POST /api/portal/sales/status/link — join ONE carrier order to ONE portal sale.
//
// This is per-ORDER and deliberately narrow. It is NOT the dealer-scoped assign
// action in ../assign/route.ts, which writes config/fiberRepMap and stamps
// matchedUserId across every order of a dealer. That action is untouched.
//
// Three body forms, deliberately unambiguous — every one returns { ok: true }:
//   { orderId, saleId: 'abc' } -> link the order to that sale
//   { orderId, saleId: null }  -> "not a sale" (a dismissal; suppresses the
//                                 address guess for this order)
//   { orderId, clear: true }   -> remove the link entirely (undo)
// `clear: true` is the ONLY way to remove a link, so an absent/undefined saleId
// is a malformed body rather than a third meaning, and a body carrying both
// `clear` and `saleId` is malformed too.
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
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    // The `clear` form and the `saleId` forms are mutually exclusive.
    const wantsClear = 'clear' in body;
    if (wantsClear && (body.clear !== true || 'saleId' in body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    // Outside the clear form saleId must be present and either a non-empty
    // string or an explicit null. undefined is a malformed body, not "clear the
    // link" — clearing is `clear: true`, and null is the dismissal.
    let saleId: string | null = null;
    if (!wantsClear) {
      if (body.saleId !== null && typeof body.saleId !== 'string') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }
      saleId = typeof body.saleId === 'string' ? body.saleId.trim() : null;
      if (typeof body.saleId === 'string' && !saleId) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }
    }

    const orderRef = adminDb.collection('fiberOrders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!wantsClear && saleId) {
      const saleDoc = await adminDb.collection('sales').doc(saleId).get();
      if (!saleDoc.exists) {
        return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
      }
    }

    const at = new Date().toISOString();
    // Only these two fields. Nothing else on the order is the admin's to change
    // here — matchedUserId, status and every carrier field stay as imported.
    // Clearing REMOVES the field rather than writing a null saleId: an absent
    // saleLink hands the order back to the address guess, which is exactly what
    // undo means, whereas `saleId: null` would keep suppressing it.
    await orderRef.update({
      saleLink: wantsClear ? FieldValue.delete() : { saleId, by: gate.uid, byName: gate.name, at },
      updatedAt: at,
    });
    invalidateFiberOrdersCache();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error linking fiber order to sale:', error);
    return NextResponse.json({ error: 'Failed to link order to sale' }, { status: 500 });
  }
}
