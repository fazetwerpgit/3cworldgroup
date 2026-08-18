import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { DecommissionReason, DecommissionReasonLabels, isManagementRole } from '@/types';

const VALID_REASONS: DecommissionReason[] = ['non_activity', 'wrongdoing', 'manager_fire'];

// POST /api/portal/pipeline/decommission - Deactivate a rep with an audit
// trail. Sets status 'inactive', disables the Firebase auth account and revokes
// its refresh tokens, and stores who/why/when. The account and history are
// preserved - this is a deactivation, not a delete.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json();
    // userId is the TARGET rep being deactivated, not the caller.
    const { userId, reason, notes } = body;

    if (!userId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, reason' },
        { status: 400 }
      );
    }

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = doc.data();
    if (data?.decommission) {
      return NextResponse.json(
        { error: 'User is already decommissioned' },
        { status: 400 }
      );
    }
    // Guard: only field reps go through decommission (platform users are
    // managed in User Management directly)
    if (isManagementRole(data?.role)) {
      return NextResponse.json(
        { error: 'Platform users cannot be decommissioned. Use User Management.' },
        { status: 400 }
      );
    }

    const now = new Date();
    await docRef.update({
      status: 'inactive',
      decommission: {
        reason,
        notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : '',
        decommissionedBy: gate.uid,
        decommissionedByName: gate.name,
        decommissionedAt: now,
      },
      updatedAt: now,
    });

    // The Firestore flag alone does not end the session: their refresh token keeps
    // minting valid ID tokens, so the API status gate would be the only thing
    // standing between an ex-employee and their old access. Disable the auth
    // account (blocks new sign-ins and refreshes immediately) and revoke issued
    // refresh tokens. Best-effort: the audit record is already written, so a
    // failure here must not fail the request - but it must be loud.
    if (adminAuth) {
      try {
        await adminAuth.updateUser(userId, { disabled: true });
        await adminAuth.revokeRefreshTokens(userId);
      } catch (err) {
        console.error('Decommission: failed to disable auth account', userId, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${data?.displayName ?? 'User'} decommissioned (${DecommissionReasonLabels[reason as DecommissionReason]})`,
    });
  } catch (error) {
    console.error('Error decommissioning user:', error);
    return NextResponse.json(
      { error: 'Failed to decommission user' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/pipeline/decommission - Reinstate a decommissioned rep
// (undo path: clears the audit record and reactivates the account).
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json();
    // userId is the TARGET rep being reinstated, not the caller.
    const { userId } = body;
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!doc.data()?.decommission) {
      return NextResponse.json(
        { error: 'User is not decommissioned' },
        { status: 400 }
      );
    }

    await docRef.update({
      status: 'active',
      decommission: FieldValue.delete(),
      updatedAt: new Date(),
    });

    // Mirror of the POST path. Required, not optional: the decommission disabled
    // the auth account, and without re-enabling it a reinstated rep could never
    // sign in again no matter what their user doc says.
    if (adminAuth) {
      try {
        await adminAuth.updateUser(userId, { disabled: false });
      } catch (err) {
        console.error('Reinstate: failed to re-enable auth account', userId, err);
      }
    }

    return NextResponse.json({ success: true, message: 'User reinstated' });
  } catch (error) {
    console.error('Error reinstating user:', error);
    return NextResponse.json(
      { error: 'Failed to reinstate user' },
      { status: 500 }
    );
  }
}
