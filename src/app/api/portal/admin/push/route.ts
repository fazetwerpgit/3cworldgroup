import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { personPushState, type PushHealth, type PushStatusRow } from '@/lib/push/pushNudge';

// Admin/owner Notifications list (People > Notifications).
// GET   /api/portal/admin/push                      → every active user's push state
// PATCH /api/portal/admin/push  { uid, required }   → set users/{uid}.pushRequired
// users docs are server-written only (firestore.rules: update if false), so this
// route is the one way pushRequired changes.

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const snapshot = await adminDb.collection('users').where('status', '==', 'active').get();
    const users: PushStatusRow[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      const tokens = Array.isArray(data.pushTokens) ? data.pushTokens.length : 0;
      const health = (data.pushHealth ?? null) as (PushHealth & { at?: unknown }) | null;
      const checked = toDate(health?.at);
      return {
        uid: doc.id,
        name: data.displayName || data.email || 'Unnamed',
        email: data.email || '',
        state: personPushState(tokens, health),
        required: data.pushRequired === true,
        checkedAt: checked ? checked.toISOString() : null,
      };
    });
    users.sort((a, b) => Number(a.state === 'on') - Number(b.state === 'on') || a.name.localeCompare(b.name));
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error loading push status:', error);
    return NextResponse.json({ error: 'Failed to load notification status' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json().catch(() => null);
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : '';
    if (!uid || uid.includes('/')) return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    if (typeof body?.required !== 'boolean') {
      return NextResponse.json({ error: 'required must be true or false' }, { status: 400 });
    }

    const ref = adminDb.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Only this one field: never let the body reach the user doc.
    await ref.update({ pushRequired: body.required });
    return NextResponse.json({ success: true, required: body.required });
  } catch (error) {
    console.error('Error updating pushRequired:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
