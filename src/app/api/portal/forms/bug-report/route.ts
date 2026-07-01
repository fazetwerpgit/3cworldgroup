import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { resolveRoles } from '@/types';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const AREAS = ['Forms', 'Sales', 'Onboarding', 'Chat', 'Leaderboard', 'Other'];

// Notify every admin's in-portal bell that a new bug report landed. Best-effort:
// a notification failure must never fail the report submission itself.
async function notifyAdmins(title: string, message: string) {
  if (!adminDb) return;
  try {
    const snap = await adminDb.collection('users').get();
    const adminUids = snap.docs
      .filter((d) => {
        const data = d.data();
        return resolveRoles(data.role, data.fieldRole).role === 'admin';
      })
      .map((d) => d.id);
    await Promise.all(
      adminUids.map((uid) =>
        adminDb!.collection('notifications').add({
          userId: uid,
          type: 'system',
          title,
          message,
          link: '/portal/admin/bug-reports',
          metadata: {},
          read: false,
          createdAt: new Date(),
        })
      )
    );
  } catch (err) {
    console.error('Failed to notify admins of bug report:', err);
  }
}

// POST /api/portal/forms/bug-report - ANY verified user can file a bug report.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const area = s(body.area, 40);
    const summary = s(body.summary, 200);
    const details = s(body.details, 4000);
    const pageUrl = s(body.pageUrl, 500);

    if (!summary) {
      return NextResponse.json({ error: 'Please describe the bug' }, { status: 400 });
    }
    const safeArea = AREAS.includes(area) ? area : 'Other';

    const { id } = await submitFormRecord(
      'bugReports',
      { uid: gate.uid, name: gate.name, email: gate.email },
      { area: safeArea, summary, details, pageUrl }
    );

    await notifyAdmins(
      'New bug report 🐞',
      `${gate.name} reported: ${summary.slice(0, 100)}`
    );

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting bug report:', error);
    return NextResponse.json({ error: 'Failed to submit bug report' }, { status: 500 });
  }
}
