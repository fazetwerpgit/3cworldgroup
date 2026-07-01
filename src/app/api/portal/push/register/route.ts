import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

// POST   /api/portal/push/register  { token }  → add this device's FCM token to the user
// DELETE /api/portal/push/register  { token }  → remove it (opt-out / sign-out)
// Tokens are stored on users/{uid}.pushTokens[] and are what the server sends push to.

export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    await adminDb.collection('users').doc(gate.uid).set(
      { pushTokens: FieldValue.arrayUnion(token) },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering push token:', error);
    return NextResponse.json({ error: 'Failed to register push token' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    await adminDb.collection('users').doc(gate.uid).set(
      { pushTokens: FieldValue.arrayRemove(token) },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing push token:', error);
    return NextResponse.json({ error: 'Failed to remove push token' }, { status: 500 });
  }
}
