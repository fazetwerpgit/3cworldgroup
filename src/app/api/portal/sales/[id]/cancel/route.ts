import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import type { SaleStatus } from '@/types';

// Cancelling a sale — the customer backed out after it was logged.
//
// This is the one route that writes `status`. Sale approval was removed in Sep
// 2026 and the PUT allowlist deliberately refuses the field so an edit can't
// resurrect approval; a cancellation is a different thing entirely, so it gets
// its own explicit, admin-only endpoint rather than a hole in that allowlist.
//
// A cancelled sale is NOT deleted: it drops out of totals, the install pipeline
// and pay (isPayableSale excludes it) but stays readable as history, with who
// cancelled it and why. DELETE here restores it, for the misclick.

const MAX_REASON = 300;

async function loadSale(id: string) {
  const docRef = adminDb!.collection('sales').doc(id);
  const doc = await docRef.get();
  return { docRef, doc };
}

// POST /api/portal/sales/[id]/cancel - mark a sale cancelled (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Cancelling takes money off a rep's board — admin/owner only, like delete.
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : '';

    const { docRef, doc } = await loadSale(id);
    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }
    if (doc.data()?.status === 'cancelled') {
      return NextResponse.json({ error: 'Sale is already cancelled' }, { status: 409 });
    }

    await docRef.update({
      status: 'cancelled' as SaleStatus,
      cancelledAt: new Date(),
      cancelledBy: gate.uid,
      cancellerName: gate.name,
      cancelReason: reason,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling sale:', error);
    return NextResponse.json({ error: 'Failed to cancel sale' }, { status: 500 });
  }
}

// DELETE /api/portal/sales/[id]/cancel - undo a cancellation (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { docRef, doc } = await loadSale(id);
    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }
    if (doc.data()?.status !== 'cancelled') {
      return NextResponse.json({ error: 'Sale is not cancelled' }, { status: 409 });
    }

    // Restoring returns the sale to the only live status the portal writes now.
    // The cancellation stamps are cleared rather than kept: a restored sale is
    // live again, and a stale "cancelled by" on it would read as still cancelled.
    await docRef.update({
      status: 'approved' as SaleStatus,
      cancelledAt: null,
      cancelledBy: null,
      cancellerName: null,
      cancelReason: '',
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error restoring sale:', error);
    return NextResponse.json({ error: 'Failed to restore sale' }, { status: 500 });
  }
}
