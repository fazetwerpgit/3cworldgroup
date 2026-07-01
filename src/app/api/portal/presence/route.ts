import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

// POST /api/portal/presence - heartbeat. Stamps the verified caller's lastActiveAt.
// Called ~every 60s by the client while a tab is visible. Best-effort: a failure
// here should never disrupt the app, so the client ignores errors.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    await adminDb.collection('users').doc(gate.uid).set(
      { lastActiveAt: new Date() },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating presence:', error);
    return NextResponse.json({ error: 'Failed to update presence' }, { status: 500 });
  }
}
