import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { requireManagement } from '@/lib/auth/requireManagement';
import { activationEmail } from '@/lib/email/templates';
import { adminDb } from '@/lib/firebase/admin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { getActivationReadiness } from '@/lib/onboarding/activation';
import { roleRequiresOnboarding } from '@/types/auth';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { requestedBy?: unknown; userId?: unknown };
    const requestedBy = typeof body.requestedBy === 'string' ? body.requestedBy : '';
    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (!requestedBy || !userId) {
      return NextResponse.json(
        { error: 'requestedBy and userId are required' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireManagement(requestedBy);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const readiness = await getActivationReadiness(userId);
    if (!readiness.ready) {
      return NextResponse.json(
        { error: 'not ready', missing: readiness.missing },
        { status: 409 }
      );
    }

    const userRef = adminDb.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }

    if (userSnap.get('status') === 'active') {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    const now = new Date();
    await userRef.update({
      status: 'active',
      ...(roleRequiresOnboarding(userSnap.get('fieldRole'))
        ? { fieldRole: 'entry_rep' }
        : {}),
      hireDate: now,
      atRisk: FieldValue.delete(),
      updatedAt: now,
    });

    await resolveAlertTasks(userId);

    const name = (userSnap.get('displayName') as string | undefined) ?? 'Rep';
    await dispatchToUser({
      userId,
      type: 'rep_activated',
      title: 'Welcome aboard - you are active',
      message: 'Your onboarding is complete.',
      link: '/portal',
      email: activationEmail({ name }),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error activating rep:', error);
    return NextResponse.json({ error: 'Failed to activate rep' }, { status: 500 });
  }
}
