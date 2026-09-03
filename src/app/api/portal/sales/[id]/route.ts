import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Sale } from '@/types';
import { requireVerifiedAdmin, requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { parseSaleDateInput, parseInstallDateInput } from '@/lib/sales/saleDate';

// GET /api/portal/sales/[id] - Get a single sale (owner or management)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // A sale row carries customer PII; only its owning rep or management may read
    // it. Gate before the lookup so an unauthorised caller cannot use the 404 to
    // probe which sale ids exist.
    const requester = await requireVerifiedRequester(request);
    if (!requester.ok) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const doc = await adminDb.collection('sales').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const data = doc.data();

    // Ownership compares the sale's stored rep against the TOKEN uid — never a
    // client-supplied field. Admin/owner only: operations sees only their own.
    if (!requester.isAdmin && data?.salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only view your own sales' },
        { status: 403 }
      );
    }

    const sale: Sale = {
      id: doc.id,
      ...data,
      saleDate: data?.saleDate?.toDate(),
      installDate: data?.installDate?.toDate(),
      createdAt: data?.createdAt?.toDate(),
      updatedAt: data?.updatedAt?.toDate(),
      approvedAt: data?.approvedAt?.toDate(),
      cancelledAt: data?.cancelledAt?.toDate(),
    } as Sale;

    return NextResponse.json({ sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sale' },
      { status: 500 }
    );
  }
}

// PUT /api/portal/sales/[id] - Update a sale
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Only the owning rep or management may edit a sale. Gate before the body is
    // read so no client-supplied field can influence who the caller is.
    const requester = await requireVerifiedRequester(request);
    if (!requester.ok) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const body = await request.json();
    const docRef = adminDb.collection('sales').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Ownership compares the sale's STORED salesRepId against the token uid.
    // Admin/owner only: operations edits only their own sales.
    const existing = doc.data();
    if (!requester.isAdmin && existing?.salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only edit your own sales' },
        { status: 403 }
      );
    }

    if (body.proofScreenshotPath) {
      const expectedPrefix = `form-attachments/${existing?.salesRepId}/sale-proof/`;
      if (!String(body.proofScreenshotPath).startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: 'Invalid screenshot reference' },
          { status: 400 }
        );
      }
    }

    // Allowlist of fields a sale edit may set. `status` stays off it: sale
    // approval was removed in Sep 2026 and no route writes the field any more,
    // so an edit must not become the back door that resurrects it. Ownership,
    // points and server-managed timestamps are immutable here for the same
    // reason — an edit is a correction, never a re-attribution.
    const EDITABLE_FIELDS = [
      'customerName',
      'customerPhone',
      'customerEmail',
      'customerAddress',
      'saleType',
      'products',
      'totalValue',
      'managerId',
      'notes',
      'orderNumberOrBtn',
      'proofScreenshotPath',
      'productSold',
    ] as const;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    if (body.saleDate !== undefined && body.saleDate !== null && body.saleDate !== '') {
      const parsed = parseSaleDateInput(body.saleDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updateData.saleDate = parsed.date;
    }

    if (body.installDate !== undefined && body.installDate !== null && body.installDate !== '') {
      const parsed = parseInstallDateInput(body.installDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updateData.installDate = parsed.date;
    }

    await docRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating sale:', error);
    return NextResponse.json(
      { error: 'Failed to update sale' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/sales/[id] - Delete a sale (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Deleting a sale is destructive and admin-only.
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const docRef = adminDb.collection('sales').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sale:', error);
    return NextResponse.json(
      { error: 'Failed to delete sale' },
      { status: 500 }
    );
  }
}
