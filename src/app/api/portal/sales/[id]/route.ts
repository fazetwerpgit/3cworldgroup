import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Sale } from '@/types';
import { getRequester, requireAdmin } from '@/lib/auth/requireManagement';

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

    const doc = await adminDb.collection('sales').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const data = doc.data();

    // A sale row carries customer PII; only its owning rep or management may read it.
    const requester = await getRequester(
      request.nextUrl.searchParams.get('requestedBy')
    );
    if (!requester) {
      return NextResponse.json({ error: 'Caller not found' }, { status: 403 });
    }
    if (!requester.isManagement && data?.salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only view your own sales' },
        { status: 403 }
      );
    }

    const sale: Sale = {
      id: doc.id,
      ...data,
      saleDate: data?.saleDate?.toDate(),
      createdAt: data?.createdAt?.toDate(),
      updatedAt: data?.updatedAt?.toDate(),
      approvedAt: data?.approvedAt?.toDate(),
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

    const body = await request.json();
    const docRef = adminDb.collection('sales').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Only the owning rep or management may edit a sale.
    const requester = await getRequester(body.requestedBy);
    if (!requester) {
      return NextResponse.json({ error: 'Caller not found' }, { status: 403 });
    }
    const existing = doc.data();
    if (!requester.isManagement && existing?.salesRepId !== requester.uid) {
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

    // Allowlist of fields a sale edit may set. Approval status and its audit
    // trail are controlled only by /sales/approve; ownership, points, and
    // server-managed timestamps are immutable here. This closes the
    // edit-to-self-approve bypass.
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
    const gate = await requireAdmin(
      request.nextUrl.searchParams.get('requestedBy')
    );
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
