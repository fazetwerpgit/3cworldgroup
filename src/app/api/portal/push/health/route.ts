import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

// POST /api/portal/push/health — the client reports what its silent push
// re-registration attempt saw (support, permission, outcome). Written to
// users/{uid}.pushHealth so ops can diagnose "pushes silently not arriving"
// from the server side without physical access to the device.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    await adminDb.collection('users').doc(gate.uid).set(
      {
        pushHealth: {
          supported: body.supported === true,
          permission: typeof body.permission === 'string' ? body.permission.slice(0, 20) : 'unknown',
          result: typeof body.result === 'string' ? body.result.slice(0, 40) : 'unknown',
          standalone: body.standalone === true,
          ua: (request.headers.get('user-agent') || '').slice(0, 200),
          at: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error recording push health:', error);
    return NextResponse.json({ error: 'Failed to record push health' }, { status: 500 });
  }
}
