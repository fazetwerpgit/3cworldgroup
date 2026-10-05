import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { writeAdminAudit } from '@/lib/audit/adminAudit';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { DecommissionReason, DecommissionReasonLabels, isManagementRole } from '@/types';

const VALID_REASONS: DecommissionReason[] = ['non_activity', 'wrongdoing', 'manager_fire'];

/**
 * True for an account that came in through an invite and never went active:
 * no activation stamp and the invite never converted. Veteran reps (no
 * invite, or activated) are false.
 */
async function neverFinishedOnboarding(data: FirebaseFirestore.DocumentData | undefined): Promise<boolean> {
  const inviteId = data?.onboardingInviteId;
  if (!adminDb || typeof inviteId !== 'string' || data?.activatedAt) return false;
  const invite = await adminDb.collection('onboardingInvites').doc(inviteId).get();
  return invite.exists && invite.data()?.status !== 'converted';
}

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
      // Read by the people route's activation gate on a later reactivation.
      ...(data?.status && data.status !== 'inactive' ? { deactivatedFromStatus: data.status } : {}),
      decommission: {
        // Reinstate returns them here (a pending hire must not come back active).
        // An already-inactive user stores none; reinstate then derives it.
        ...(data?.status === 'pending' || data?.status === 'active' ? { previousStatus: data.status } : {}),
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

    // Drop them from every chat channel's memberIds (Firestore reads + pushes).
    try {
      await reconcileChatMembershipForUser(userId);
    } catch (err) {
      console.error('Decommission: failed to reconcile chat membership', userId, err);
    }

    // Their open tasks (unclaimed, stalled, review, activation) are moot now;
    // left open they re-nag admins daily.
    try {
      await resolveAlertTasks(userId);
    } catch (err) {
      console.error('Decommission: failed to resolve alert tasks', userId, err);
    }

    await writeAdminAudit({
      action: 'user.decommission',
      actorUid: gate.uid,
      actorName: gate.name,
      targetUid: userId,
      targetName: data?.displayName || undefined,
      details: { reason },
    });

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

// DELETE /api/portal/pipeline/decommission - Reinstate an inactive rep (undo
// path: clears any decommission record and restores their prior status). Also
// covers reps made inactive elsewhere (rejected invite, People), which Pipeline
// lists as decommissioned.
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
    const data = doc.data();
    // An active user can still carry a decommission marker: before Oct 1,
    // reactivating in People left it behind, and Pipeline still lists them as
    // decommissioned. Reinstate clears it and keeps them active.
    const staleMarker = data?.status === 'active' && !!data?.decommission;
    if ((data?.status !== 'inactive' && !staleMarker) || isManagementRole(data?.role)) {
      return NextResponse.json(
        { error: 'User is not decommissioned' },
        { status: 400 }
      );
    }
    // Read before the update: this is the state being undone, and the audit row needs it.
    const previousReason = data?.decommission?.reason ?? null;
    const targetName = data?.displayName;
    const storedStatus = data?.decommission?.previousStatus;
    // Records written before previousStatus existed come back active, as they
    // always did: most belong to veteran reps who never had a checklist. Only
    // an account that never finished onboarding goes back to pending: one
    // that came in through an invite, was never activated, and whose invite
    // never converted (e.g. a recruit rejected from Invites).
    let status: 'active' | 'pending';
    if (staleMarker) {
      status = 'active';
    } else if (storedStatus === 'active' || storedStatus === 'pending') {
      status = storedStatus;
    } else {
      status = (await neverFinishedOnboarding(data)) ? 'pending' : 'active';
    }

    await docRef.update({
      status,
      deactivatedFromStatus: FieldValue.delete(),
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

    // Back into the channels their role reaches.
    try {
      await reconcileChatMembershipForUser(userId);
    } catch (err) {
      console.error('Reinstate: failed to reconcile chat membership', userId, err);
    }

    // Reinstating deletes the decommission record from the user doc, so this row
    // is the only lasting trace of who reinstated them and what it undid.
    await writeAdminAudit({
      action: 'user.reinstate',
      actorUid: gate.uid,
      actorName: gate.name,
      targetUid: userId,
      targetName: targetName || undefined,
      details: { previousReason, restoredStatus: status },
    });

    return NextResponse.json({ success: true, message: 'User reinstated', status });
  } catch (error) {
    console.error('Error reinstating user:', error);
    return NextResponse.json(
      { error: 'Failed to reinstate user' },
      { status: 500 }
    );
  }
}
