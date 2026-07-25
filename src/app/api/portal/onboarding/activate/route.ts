import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { activationEmail } from '@/lib/email/templates';
import { adminDb } from '@/lib/firebase/admin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { getActivationReadiness } from '@/lib/onboarding/activation';
import { roleRequiresOnboarding } from '@/types/auth';

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Activating a rep is management-only. Gate before reading the body: the
    // activator is whoever holds the token, never a requestedBy the client names.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = (await request.json()) as { userId?: unknown };
    // The TARGET rep being activated — data, and required: without it the route
    // would have no one to activate.
    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
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
