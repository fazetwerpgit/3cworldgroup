import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { installDayKey, parseInstallDateInput } from '@/lib/sales/saleDate';
import { loadCarrierOrders } from '@/lib/sales/carrierSnapshot';
import { carrierOrderForSale } from '@/lib/sales/installDateSync';

// A rep setting or moving the install date on their OWN sale — the one edit a
// rep is allowed (owner decision, Sep 2026). The customer reschedules at the
// door or by text, and the rep is the first to know; before this they had to
// ask an admin or log the sale again.
//
// Deliberately narrower than PUT /api/portal/sales/[id]: the body is the
// install date and nothing else, the caller must be the sale's own rep (admins
// keep the full edit), and a cancelled or rejected sale stays as it is.
//
// The carrier report still moves install dates on its own (installDateSync);
// the rep's edit is the fallback. To keep the two from undoing each other, the
// edit records the carrier row the sale stood on and its date at that moment.
// The sync then overrides the rep only when the carrier has news since.
//
// The read and the write are one transaction: a report sync or an admin edit
// landing in between makes Firestore run it again on the fresh sale, so no one
// decides on a sale that has already moved.

const ALLOWED_KEYS = new Set(['installDate']);
const CLOSED_STATUSES = new Set(['cancelled', 'rejected']);

// PATCH /api/portal/sales/[id]/install-date - the sale's rep sets its install date
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const requester = await requireVerifiedRequester(request);
    if (!requester.ok) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const extra = Object.keys(body).filter((key) => !ALLOWED_KEYS.has(key));
    if (extra.length) {
      return NextResponse.json({ error: 'Only the install date can be changed here' }, { status: 400 });
    }

    const parsed = parseInstallDateInput((body as { installDate?: unknown }).installDate);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Loaded before the transaction (it is a cached read of every order, not a
    // sale field) and matched inside it against the sale as the transaction saw it.
    const carrierOrders = await loadCarrierOrders();
    const docRef = adminDb.collection('sales').doc(id);
    const refusal = await adminDb.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      if (!doc.exists) {
        return { error: 'Sale not found', status: 404 };
      }

      // Ownership is the STORED salesRepId against the token uid, admins included:
      // management corrects other reps' sales through the full edit, not here.
      const existing = doc.data() ?? {};
      if (existing.salesRepId !== requester.uid) {
        return { error: 'Forbidden: you can only change your own sales', status: 403 };
      }
      if (CLOSED_STATUSES.has(String(existing.status ?? ''))) {
        return { error: 'This sale is cancelled', status: 409 };
      }

      // An install never comes before the sale; that is a typo, not a reschedule.
      const nextDay = installDayKey(parsed.date);
      const soldDay = installDayKey(existing.saleDate);
      if (nextDay && soldDay && nextDay < soldDay) {
        return { error: 'Install date is before the sale date', status: 400 };
      }

      // Stamped only when the day actually moves, as the full edit does, so the
      // carrier sync and the admin view can tell who set the date last.
      if (installDayKey(existing.installDate) !== nextDay) {
        const carrier = carrierOrders ? carrierOrderForSale({ id, data: existing }, carrierOrders) : null;
        const now = new Date();
        tx.update(docRef, {
          installDate: parsed.date,
          installDateSource: 'rep',
          installDatePreviousDate: existing.installDate ?? null,
          installDateChangedAt: now,
          installDateSetAt: now,
          repEditOrderId: carrier?.orderId ?? null,
          repEditCarrierDate: carrier?.estInstallDate ?? null,
          updatedAt: now,
        });
      }
      return null;
    });
    if (refusal) {
      return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    }

    return NextResponse.json({ success: true, installDate: parsed.date.toISOString() });
  } catch (error) {
    console.error('Error setting install date:', error);
    return NextResponse.json({ error: 'Failed to update install date' }, { status: 500 });
  }
}
