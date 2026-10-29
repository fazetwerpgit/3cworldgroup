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

/** Statuses an applicant can be turned down from: nobody has invited them yet.
 *  Matches isWaitingApplication (applicantAging), the To do applicant list. */
const OPEN_STATUSES = new Set(['applied']);

/** A Firestore document id the route accepts: no path segments, no reserved names. */
function isValidId(id: string | undefined): id is string {
  return !!id && id.length <= 120 && !id.includes('/') && !/^\.{1,2}$|^__.*__$/.test(id);
}

class Conflict extends Error {}
class Missing extends Error {}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireVerifiedRecruiting(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const db = adminDb;
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: 'Invalid application' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== 'not_fit' && action !== 'restore') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    const ref = db.collection('applications').doc(id);
    // Read, check and write in one transaction so two reviewers (or a review
    // racing an invite) cannot both act on the same stale status.
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Missing();
      const data = snap.data() ?? {};
      const status = typeof data.status === 'string' ? data.status : 'applied';
      const now = new Date();

      if ((action as Action) === 'not_fit') {
        if (!OPEN_STATUSES.has(status)) throw new Conflict('This applicant was already handled.');
        tx.update(ref, {
          status: 'not_selected',
          statusBeforeNotSelected: status,
          notSelectedAt: now,
          notSelectedBy: gate.uid,
          notSelectedByName: gate.name,
          updatedAt: now,
        });
        return 'not_selected';
      }

      if (status !== 'not_selected') throw new Conflict('This applicant is not archived.');
      const previous =
        typeof data.statusBeforeNotSelected === 'string' && OPEN_STATUSES.has(data.statusBeforeNotSelected)
          ? data.statusBeforeNotSelected
          : 'applied';
      tx.update(ref, {
        status: previous,
        statusBeforeNotSelected: FieldValue.delete(),
        notSelectedAt: FieldValue.delete(),
        notSelectedBy: FieldValue.delete(),
        notSelectedByName: FieldValue.delete(),
        updatedAt: now,
      });
      return previous;
    });
    return NextResponse.json({ ok: true, status: result });
  } catch (error) {
    if (error instanceof Missing) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (error instanceof Conflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('[applications] status change failed', error);
    return NextResponse.json({ error: 'Failed to update the applicant' }, { status: 500 });
  }
}
