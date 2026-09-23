import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { installDayKey, parseInstallDateInput } from '@/lib/sales/saleDate';

// A rep setting or moving the install date on their OWN sale — the one edit a
// rep is allowed (owner decision, Sep 2026). The customer reschedules at the
// door or by text, and the rep is the first to know; before this they had to
// ask an admin or log the sale again.
//
// Deliberately narrower than PUT /api/portal/sales/[id]: the body is the
// install date and nothing else, the caller must be the sale's own rep (admins
// keep the full edit), and a cancelled or rejected sale stays as it is.

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

    const docRef = adminDb.collection('sales').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Ownership is the STORED salesRepId against the token uid, admins included:
    // management corrects other reps' sales through the full edit, not here.
    const existing = doc.data() ?? {};
    if (existing.salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only change your own sales' },
        { status: 403 }
      );
    }
    if (CLOSED_STATUSES.has(String(existing.status ?? ''))) {
      return NextResponse.json({ error: 'This sale is cancelled' }, { status: 409 });
    }

    // An install never comes before the sale; that is a typo, not a reschedule.
    const nextDay = installDayKey(parsed.date);
    const soldDay = installDayKey(existing.saleDate);
    if (nextDay && soldDay && nextDay < soldDay) {
      return NextResponse.json({ error: 'Install date is before the sale date' }, { status: 400 });
    }

    // Stamped only when the day actually moves, as the full edit does, so the
    // carrier sync and the admin view can tell who set the date last.
    if (installDayKey(existing.installDate) !== nextDay) {
      await docRef.update({
        installDate: parsed.date,
        installDateSource: 'rep',
        installDatePreviousDate: existing.installDate ?? null,
        installDateChangedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, installDate: parsed.date.toISOString() });
  } catch (error) {
    console.error('Error setting install date:', error);
    return NextResponse.json({ error: 'Failed to update install date' }, { status: 500 });
  }
}
