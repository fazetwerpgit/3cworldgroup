import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { looksLikeBotSignup } from '@/lib/auth/botDetection';

export async function POST(request: Request) {
  let uid: string | undefined;

  try {
    const body = (await request.json()) as { uid?: string };
    uid = body.uid;
  } catch {
    return NextResponse.json({ error: 'uid required' }, { status: 400 });
  }

  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  if (!adminDb) {
    console.error('[signup-notify] Database not configured');
    return NextResponse.json({ ok: true });
  }

  try {
    const snap = await adminDb.doc(`users/${uid}`).get();
    if (!snap.exists || snap.get('status') !== 'pending' || snap.get('fieldRole')) {
      return NextResponse.json({ ok: true });
    }

    const email = (snap.get('email') as string | undefined) ?? '';
    const displayName = (snap.get('displayName') as string | undefined) ?? '';
    if (looksLikeBotSignup(email, displayName)) {
      await adminDb.doc(`users/${uid}`).update({ suspectedBot: true, updatedAt: new Date() });
      return NextResponse.json({ ok: true });
    }

    const name = displayName || email || uid;
    await createAlertTask({
      kind: 'pending_assignment',
      subjectUserId: uid,
      subjectName: name,
      title: `${name} self-registered and needs a position`,
      message: 'Assign their role to start onboarding.',
      link: '/portal/admin/users',
    });
  } catch (error) {
    console.error('[signup-notify] Failed to notify pending signup:', error);
  }

  return NextResponse.json({ ok: true });
}
