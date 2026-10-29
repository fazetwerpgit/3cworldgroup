import { after, NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiting } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import {
  activateUser,
  DEACTIVATED_ACTIVATION_ERROR,
  getActivationReadiness,
  isDeactivatedAccount,
  sendOnboardingPacketOnce,
} from '@/lib/onboarding/activation';

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Activating a rep is management-only. Gate before reading the body: the
    // activator is whoever holds the token, never a requestedBy the client names.
    const gate = await requireVerifiedRecruiting(request);
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

    // Deactivated or decommissioned accounts come back only through the
    // management-only reinstate route, never through Activate (for anyone).
    const target = await adminDb.doc(`users/${userId}`).get();
    if (target.exists && isDeactivatedAccount(target.get('status'), target.get('decommission'))) {
      return NextResponse.json({ error: DEACTIVATED_ACTIVATION_ERROR }, { status: 409 });
    }

    const readiness = await getActivationReadiness(userId);
    if (!readiness.ready) {
      return NextResponse.json(
        { error: 'not ready', missing: readiness.missing },
        { status: 409 }
      );
    }

    const activation = await activateUser(userId, { deferPacket: true });
    if (!activation) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }
    if (activation.deactivated) {
      return NextResponse.json({ error: DEACTIVATED_ACTIVATION_ERROR }, { status: 409 });
    }
    // The owner packet (attachments, several sends) goes out after the
    // response; its stamp keeps it to one per rep.
    if (activation.packetDue) {
      after(() => sendOnboardingPacketOnce(userId));
    }

    return NextResponse.json({ ok: true, ...(activation.alreadyActive ? { alreadyActive: true } : {}) });
  } catch (error) {
    console.error('Error activating rep:', error);
    return NextResponse.json({ error: 'Failed to activate rep' }, { status: 500 });
  }
}
