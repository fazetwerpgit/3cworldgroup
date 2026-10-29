import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedRecruiting } from '@/lib/auth/requireVerifiedAdmin';

// PATCH /api/portal/recruiting/applications/<id>: "Not a fit" on a website
// applicant from Hiring > To do, and its undo. Soft only: the application
// stays in Firestore with status 'not_selected' (the existing status the
// Recruits list already shows as "Not selected"), stamped with when and by
// whom, and the status it had before so a restore puts it back exactly.
// Management or the hidden recruiter grant (requireVerifiedRecruiting), the
// same gate as the other recruiting review routes.

type Action = 'not_fit' | 'restore';

/** Statuses an applicant can be turned down from: nobody has invited them yet. */
const OPEN_STATUSES = new Set(['applied', 'contacted']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireVerifiedRecruiting(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const { id } = await params;
  if (!id || id.length > 120 || id.includes('/')) {
    return NextResponse.json({ error: 'Invalid application' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== 'not_fit' && action !== 'restore') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('applications').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    const data = snap.data() ?? {};
    const status = typeof data.status === 'string' ? data.status : 'applied';
    const now = new Date();

    if ((action as Action) === 'not_fit') {
      if (!OPEN_STATUSES.has(status)) {
        return NextResponse.json({ error: 'This applicant was already handled.' }, { status: 409 });
      }
      await ref.update({
        status: 'not_selected',
        statusBeforeNotSelected: status,
        notSelectedAt: now,
        notSelectedBy: gate.uid,
        notSelectedByName: gate.name,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, status: 'not_selected' });
    }

    if (status !== 'not_selected') {
      return NextResponse.json({ error: 'This applicant is not archived.' }, { status: 409 });
    }
    const previous =
      typeof data.statusBeforeNotSelected === 'string' && OPEN_STATUSES.has(data.statusBeforeNotSelected)
        ? data.statusBeforeNotSelected
        : 'applied';
    await ref.update({
      status: previous,
      statusBeforeNotSelected: FieldValue.delete(),
      notSelectedAt: FieldValue.delete(),
      notSelectedBy: FieldValue.delete(),
      notSelectedByName: FieldValue.delete(),
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, status: previous });
  } catch (error) {
    console.error('[applications] status change failed', error);
    return NextResponse.json({ error: 'Failed to update the applicant' }, { status: 500 });
  }
}
