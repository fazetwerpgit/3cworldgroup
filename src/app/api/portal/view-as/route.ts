import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { loadViewAsTarget, logViewAs, subjectFromDoc } from '@/lib/auth/viewAs';
import type { ViewAsRep } from '@/lib/auth/viewAsHeader';

export const dynamic = 'force-dynamic';

// GET /api/portal/view-as            - the active field reps the owner may view as
// GET /api/portal/view-as?uid=<rep>  - one rep's profile, to start a view session
//
// OWNER ONLY (admin, operations and every rep get 403) — the same check as
// /api/portal/owner/summary. Names, emails and roles only: the rep's data
// itself comes from the rep routes, read through resolveSubject.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  if (!gate.isOwner) {
    return NextResponse.json({ error: 'Forbidden: owner access required' }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const headers = { 'Cache-Control': 'private, no-store' };

  try {
    const uid = request.nextUrl.searchParams.get('uid');
    if (uid !== null) {
      const loaded = await loadViewAsTarget(uid);
      if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
      // Starting a session counts as its first view.
      await logViewAs(gate.uid, uid);
      const rep: ViewAsRep = {
        uid,
        displayName: loaded.target.name,
        email: loaded.target.email,
        fieldRole: loaded.target.fieldRole!,
        avatarUrl: loaded.target.avatarUrl,
      };
      return NextResponse.json({ rep }, { headers });
    }

    const snapshot = await adminDb.collection('users').where('status', '==', 'active').get();
    const reps: ViewAsRep[] = [];
    snapshot.forEach((doc) => {
      const subject = subjectFromDoc(doc.id, doc.data());
      if (subject.role || !subject.fieldRole) return;
      reps.push({
        uid: doc.id,
        displayName: subject.name,
        email: subject.email,
        fieldRole: subject.fieldRole,
        avatarUrl: subject.avatarUrl,
      });
    });
    reps.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ reps }, { headers });
  } catch (error) {
    console.error('[view-as]', error);
    return NextResponse.json({ error: 'Failed to load reps' }, { status: 500 });
  }
}
