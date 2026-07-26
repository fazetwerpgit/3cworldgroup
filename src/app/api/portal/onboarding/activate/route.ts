import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { activateUser, getActivationReadiness } from '@/lib/onboarding/activation';

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

    const activation = await activateUser(userId);
    if (!activation) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...(activation.alreadyActive ? { alreadyActive: true } : {}) });
  } catch (error) {
    console.error('Error activating rep:', error);
    return NextResponse.json({ error: 'Failed to activate rep' }, { status: 500 });
  }
}
