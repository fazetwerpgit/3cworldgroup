import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initError } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { SALE_DRAFTS_COLLECTION, isDraftId } from '@/lib/sales/knockDrafts';

// DELETE /api/portal/sales/drafts/[id] - the rep dismisses one of their drafts
// (the Sold was a mistake, or the sale was logged some other way). The doc is
// kept as a 'dismissed' tombstone so the app's offline queue repeating the
// same Sold later cannot bring it back; it is gone from every list.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured', details: initError || 'adminDb is null' },
        { status: 500 }
      );
    }
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { id } = await params;
    if (!isDraftId(id)) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const ref = adminDb.collection(SALE_DRAFTS_COLLECTION).doc(id);
    const outcome = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      // Someone else's draft reads as missing, so ids cannot be probed.
      if (!snap.exists || !data || data.salesRepId !== gate.uid) return 'missing' as const;
      if (data.status === 'submitted') return 'submitted' as const;
      if (data.status === 'open') {
        tx.update(ref, { status: 'dismissed', dismissedAt: new Date(), updatedAt: new Date() });
      }
      return 'dismissed' as const;
    });

    if (outcome === 'missing') {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }
    if (outcome === 'submitted') {
      return NextResponse.json({ error: 'This sale was already logged' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error dismissing sale draft:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss sale draft', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
