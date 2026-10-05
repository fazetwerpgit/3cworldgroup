import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  User,
  PlatformRole,
  FieldRole,
  FieldRoles,
  isManagementRole,
  MANAGEMENT_FIELD_ROLES,
  MANAGEMENT_PLATFORM_ROLES,
  roleRequiresOnboarding,
  resolveRoles,
} from '@/types';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { validateAddress } from '@/lib/validation/address';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { kickoffOnboardingChecklist } from '@/lib/onboarding/kickoff';
import { restampAuthor } from '@/lib/chat/restampAuthor';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { restampDisplayName } from '@/lib/users/restampDisplayName';
import { purgeSensitiveUserData } from '@/lib/users/purgeSensitiveUserData';
import { writeAdminAudit } from '@/lib/audit/adminAudit';
import { getActivationReadinessForRole } from '@/lib/onboarding/activation';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

const VALID_STATUSES = ['active', 'inactive', 'pending'];

/**
 * An inactive account that never went active: deactivated straight from
 * pending (deactivatedFromStatus, stamped since this gate), or, for accounts
 * deactivated before that stamp existed, an invite hire with no activatedAt.
 * activatedAt is stamped by every activation path (activateUser and the
 * pending -> active save here); hireDate is not a marker, the invite submit
 * sets it on a pending hire. A rep activated before activatedAt existed
 * (pre 2026-09-22) and deactivated before deactivatedFromStatus existed reads
 * as never activated only if they came through an invite; they still pass if
 * their checklist is complete, as the activation gate required since July.
 */
function neverActivated(doc: FirebaseFirestore.DocumentSnapshot): boolean {
  const from = doc.get('deactivatedFromStatus');
  if (from !== undefined) return from === 'pending';
  if (doc.get('activatedAt')) return false;
  return typeof doc.get('onboardingInviteId') === 'string';
}

// GET /api/portal/auth/users/[id] - Get a single user (management only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // A user's directory record (incl. PII) is management-only.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const doc = await adminDb.collection('users').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = doc.data();
    const user: User = {
      uid: doc.id,
      email: data?.email,
      displayName: data?.displayName,
      ...resolveRoles(data?.role, data?.fieldRole),
      isIBO: data?.isIBO ?? false,
      // TODO: migrate Firestore managerId -> reportsToId
      reportsToId: data?.reportsToId ?? data?.managerId,
      territoryId: data?.territoryId,
      phone: data?.phone,
      address: data?.address,
      city: data?.city,
      state: data?.state,
      zip: data?.zip,
      shirtSize: data?.shirtSize,
      avatarUrl: data?.avatarUrl,
      status: data?.status,
      hireDate: data?.hireDate?.toDate(),
      createdAt: data?.createdAt?.toDate(),
      updatedAt: data?.updatedAt?.toDate(),
    } as User;

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT /api/portal/auth/users/[id] - Update a user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: 'Firebase Admin is not configured' },
        { status: 500 }
      );
    }

    // Only admin/operations may edit users (incl. changing roles/status).
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json();
    const { displayName, role, fieldRole, managerId, territoryId, phone, status, address, city, state, zip } = body;

    const docRef = adminDb.collection('users').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const existingFieldRole = doc.get('fieldRole') as FieldRole | undefined;
    const existingRole = doc.get('role') as PlatformRole | undefined;
    const existingDisplayName = doc.get('displayName') as string | undefined;

    // Platform-role boundary: only an admin may grant admin/operations, and
    // only an admin may edit a user who already holds a platform role.
    // Without this, an operations caller could escalate anyone (including
    // themselves) to admin, or rewrite an admin's record.
    if (role !== undefined && !gate.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: only an admin can assign platform roles' },
        { status: 403 }
      );
    }
    if (isManagementRole(existingRole) && !gate.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: only an admin can edit a platform account' },
        { status: 403 }
      );
    }
    // The owner tier is the only one an admin cannot reach: an admin must not be
    // able to edit an owner's record, nor promote anyone (including themselves)
    // into the finance tier.
    if (existingRole === 'owner' && !gate.isOwner) {
      return NextResponse.json(
        { error: 'Forbidden: only an owner can edit an owner account' },
        { status: 403 }
      );
    }
    if (role === 'owner' && !gate.isOwner) {
      return NextResponse.json(
        { error: 'Forbidden: only an owner can assign the owner role' },
        { status: 403 }
      );
    }

    // Validate shapes before anything is written: `role` is platform-only,
    // `fieldRole` is field-only, and a null/'' role would strip both roles.
    const validPlatformRoles: PlatformRole[] = [...MANAGEMENT_PLATFORM_ROLES];
    const validFieldRoles: FieldRole[] = Object.values(FieldRoles);
    if (role !== undefined && fieldRole !== undefined) {
      return NextResponse.json(
        { error: 'Provide either role (platform) or fieldRole (field sales), not both' },
        { status: 400 }
      );
    }
    if (role !== undefined && !validPlatformRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }
    if (fieldRole !== undefined && !validFieldRoles.includes(fieldRole)) {
      return NextResponse.json(
        { error: 'Invalid fieldRole' },
        { status: 400 }
      );
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }
    if (phone !== undefined && (typeof phone !== 'string' || phone.length > 40)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }
    if (territoryId !== undefined && (typeof territoryId !== 'string' || territoryId.length > 128)) {
      return NextResponse.json({ error: 'Invalid territoryId' }, { status: 400 });
    }
    if (
      managerId !== undefined &&
      managerId !== null &&
      (typeof managerId !== 'string' || !managerId || managerId.length > 128)
    ) {
      return NextResponse.json({ error: 'Invalid managerId' }, { status: 400 });
    }
    if (managerId === id) {
      return NextResponse.json({ error: 'A person cannot be their own manager' }, { status: 400 });
    }

    // Nobody may lock themselves out: there is no self-service way back from a
    // disabled account or a lost platform role.
    if (gate.uid === id) {
      if (status !== undefined && status !== 'active') {
        return NextResponse.json(
          { error: 'You cannot deactivate your own account' },
          { status: 400 }
        );
      }
      if (isManagementRole(existingRole) && fieldRole !== undefined) {
        return NextResponse.json(
          { error: 'You cannot remove your own platform role' },
          { status: 400 }
        );
      }
    }
    // Only an owner can grant the owner role, so losing the last active owner
    // locks payroll, comp plan and exports until Firestore is edited by hand.
    const removesOwner =
      (role !== undefined && role !== 'owner') || fieldRole !== undefined || (status !== undefined && status !== 'active');
    if (existingRole === 'owner' && doc.get('status') === 'active' && removesOwner) {
      const owners = await adminDb.collection('users').where('role', '==', 'owner').get();
      if (!owners.docs.some((owner) => owner.id !== id && owner.get('status') === 'active')) {
        return NextResponse.json(
          {
            error:
              'This is the last active owner. Make someone else an owner before deactivating or changing the role of this account.',
          },
          { status: 409 }
        );
      }
    }

    // A new manager must be an active person in a management role. Re-sending
    // the stored manager is not a change, so it is accepted even if they have
    // since stopped being eligible.
    const storedManagerId = (doc.get('reportsToId') ?? doc.get('managerId')) as string | undefined;
    if (typeof managerId === 'string' && managerId !== storedManagerId) {
      const manager = await adminDb.collection('users').doc(managerId).get();
      const managerRoles = resolveRoles(manager.get('role'), manager.get('fieldRole'));
      const eligible =
        manager.exists &&
        manager.get('status') === 'active' &&
        (isManagementRole(managerRoles.role) ||
          (managerRoles.fieldRole ? MANAGEMENT_FIELD_ROLES.includes(managerRoles.fieldRole) : false));
      if (!eligible) {
        return NextResponse.json(
          { error: 'The manager must be an active person in a management role' },
          { status: 400 }
        );
      }
    }

    const addressCheck = validateAddress({ address, city, state, zip });
    if (!addressCheck.ok) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // An empty/whitespace displayName is treated as no change: never persist
    // it (Firestore or Auth), since downstream chat/UI falls back to email
    // when displayName is falsy.
    const trimmedDisplayName =
      typeof displayName === 'string' ? displayName.trim() : undefined;
    if (trimmedDisplayName) updateData.displayName = trimmedDisplayName;
    // A user is either platform or field: assigning one role kind clears the
    // other so a stale legacy `role` value can't shadow the new fieldRole.
    if (role !== undefined) {
      updateData.role = role;
      updateData.fieldRole = FieldValue.delete();
    } else if (fieldRole !== undefined) {
      updateData.fieldRole = fieldRole;
      updateData.role = FieldValue.delete();
    }
    // Every reader prefers reportsToId (an invite claim sets both), so the two
    // are always set or cleared together.
    if (managerId !== undefined) {
      updateData.reportsToId = managerId ?? FieldValue.delete();
      updateData.managerId = managerId ?? FieldValue.delete();
    }
    if (territoryId !== undefined) updateData.territoryId = territoryId;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined)
      updateData.address = addressCheck.clean.address ?? FieldValue.delete();
    if (city !== undefined)
      updateData.city = addressCheck.clean.city ?? FieldValue.delete();
    if (state !== undefined)
      updateData.state = addressCheck.clean.state ?? FieldValue.delete();
    if (zip !== undefined)
      updateData.zip = addressCheck.clean.zip ?? FieldValue.delete();
    if (status !== undefined) updateData.status = status;
    // A body without fieldRole (e.g. a name-only save) never kicks off
    // onboarding: roleRequiresOnboarding(undefined) is false.
    const shouldKickoffChecklist =
      roleRequiresOnboarding(fieldRole) &&
      existingFieldRole !== fieldRole &&
      status === undefined &&
      doc.get('status') === 'pending';
    const assigningRole = role !== undefined || fieldRole !== undefined;
    // For field-role assignments this now covers exactly the three
    // non-invitable roles (general_manager, gm_in_training, office_manager),
    // which have no checklist and must not be left pending without an
    // activation path. Platform-role assignments also retain their existing
    // immediate activation behavior.
    const shouldActivateImmediately =
      assigningRole &&
      status === undefined &&
      doc.get('status') === 'pending' &&
      !roleRequiresOnboarding(fieldRole);
    if (shouldActivateImmediately) updateData.status = 'active';
    // Stamp the pending -> active flip (Accept, or immediate activation above)
    // for the owner "Activated" tile. hireDate is left as is. Reactivating an
    // inactive account is not a new activation, so it is not stamped.
    if (updateData.status === 'active' && doc.get('status') === 'pending') {
      updateData.activatedAt = FieldValue.serverTimestamp();
    }
    // Reactivating a decommissioned rep here (instead of through the pipeline's
    // Reinstate) must clear the decommission marker too: left set, the pipeline
    // keeps showing them as decommissioned and a later decommission is refused
    // as "already decommissioned".
    if (updateData.status === 'active' && doc.get('decommission')) {
      updateData.decommission = FieldValue.delete();
    }

    // A hire on an onboarding checklist goes active only when it is complete,
    // the same gate as /api/portal/onboarding/activate. It covers an explicit
    // Accept, a role change that activates immediately, and pending ->
    // inactive -> active: an inactive account that was never activated (see
    // neverActivated) is still a hire, not a rep being reactivated. The gate
    // follows the role the user ends up with: promoting a pending hire to a
    // role with no checklist (GM, office, platform) is not gated. An owner who
    // needs to skip an item marks it complete (onboarding/mark-complete).
    const resultingFieldRole: FieldRole | undefined =
      role !== undefined ? undefined : fieldRole !== undefined ? fieldRole : existingFieldRole;
    const previousStatus = doc.get('status');
    const becomingActive =
      updateData.status === 'active' &&
      (previousStatus === 'pending' || (previousStatus === 'inactive' && neverActivated(doc)));
    if (becomingActive && resultingFieldRole && roleRequiresOnboarding(resultingFieldRole)) {
      const readiness = await getActivationReadinessForRole(id, resultingFieldRole, !!doc.get('isIBO'));
      if (!readiness.ready) {
        const labels = readiness.missing.map(
          (itemId) => ONBOARDING_ITEMS.find((item) => item.id === itemId)?.label ?? itemId
        );
        return NextResponse.json(
          {
            error: labels.length
              ? `Onboarding is not complete, so this account cannot be activated yet. Still open: ${labels.join(', ')}. Approve those items, or mark them complete from Onboarding review.`
              : 'Onboarding is not complete, so this account cannot be activated yet.',
            missing: readiness.missing,
          },
          { status: 409 }
        );
      }
    }
    // Remember what an account was before it went inactive, so a later
    // reactivation can tell a rep (ungated) from a hire who never finished.
    if (updateData.status === 'inactive' && previousStatus !== 'inactive') {
      updateData.deactivatedFromStatus = previousStatus ?? null;
    }

    // Update displayName in Firebase Auth if changed
    if (trimmedDisplayName) {
      await adminAuth.updateUser(id, { displayName: trimmedDisplayName });
    }

    await docRef.update(updateData);

    // Personal data (phone, address ...) is logged by field name only; status
    // and role are not personal, so their before/after is recorded. Only fields
    // whose stored value actually changes are listed, and a save that changes
    // nothing writes no row.
    const changedFields = Object.keys(updateData).filter((key) => {
      if (
        key === 'updatedAt' ||
        key === 'activatedAt' ||
        key === 'decommission' ||
        key === 'deactivatedFromStatus'
      ) {
        return false;
      }
      const before = doc.get(key);
      const after = updateData[key];
      return after === FieldValue.delete()
        ? before !== undefined
        : JSON.stringify(before) !== JSON.stringify(after);
    });
    const roleAuditChanged = changedFields.includes('role') || changedFields.includes('fieldRole');
    if (changedFields.length > 0) {
      await writeAdminAudit({
        action: 'user.update',
        actorUid: gate.uid,
        actorName: gate.name,
        targetUid: id,
        targetName: doc.get('displayName') || undefined,
        details: {
          fields: changedFields,
          ...(changedFields.includes('status')
            ? { status: { from: doc.get('status') ?? null, to: updateData.status } }
            : {}),
          ...(roleAuditChanged
            ? { role: { from: existingRole ?? existingFieldRole ?? null, to: role ?? fieldRole } }
            : {}),
          ...(updateData.decommission !== undefined
            ? {
                // The record is deleted by this save; keep what it said (never its notes).
                decommissionCleared: {
                  previousReason: doc.get('decommission')?.reason ?? null,
                  decommissionedBy: doc.get('decommission')?.decommissionedBy ?? null,
                },
              }
            : {}),
        },
      });
    }

    // Flipping the Firestore flag does not end the session: the account's refresh
    // token keeps minting valid ID tokens, so the API status gate would be the
    // only thing standing between a deactivated admin and their old admin access.
    // Disable the auth account (blocks new sign-ins and refreshes immediately)
    // and revoke issued refresh tokens. Re-enabling on 'active' is required, not
    // symmetry: without it a reinstated user — including one disabled by
    // pipeline/decommission — could never sign in again whatever their doc says.
    // 'pending' is deliberately not disabled: an unapproved self-signup must
    // still be able to sign in to reach the pending screen.
    // Best-effort: the profile update is already committed above, so a Firebase
    // Auth failure must not fail the request - but it must be loud.
    if (adminAuth && updateData.status === 'inactive') {
      try {
        await adminAuth.updateUser(id, { disabled: true });
        await adminAuth.revokeRefreshTokens(id);
      } catch (err) {
        console.error('[users] Failed to disable auth account', id, err);
      }
    } else if (adminAuth && updateData.status === 'active') {
      try {
        await adminAuth.updateUser(id, { disabled: false });
      } catch (err) {
        console.error('[users] Failed to re-enable auth account', id, err);
      }
    }

    // Open alert tasks re-nag every admin daily until resolved. Deactivating
    // someone ends all of theirs; a manual Accept (pending -> active with a
    // field role) closes the onboarding ones activateUser would have closed.
    const acceptedManually =
      status === 'active' && fieldRole !== undefined && doc.get('status') === 'pending';
    if (updateData.status === 'inactive' || acceptedManually) {
      try {
        await resolveAlertTasks(
          id,
          acceptedManually
            ? ['pending_assignment', 'stalled_rep', 'review_needed', 'activation_ready']
            : undefined
        );
      } catch (error) {
        console.error('[users] Failed to resolve open alert tasks', id, error);
      }
    }

    // Chat channel memberIds gate the Firestore reads and pushes, so a role or
    // status change must add/remove this user per channel right away. Fail-soft
    // like the restamps below: the profile update is already committed.
    if (role !== undefined || fieldRole !== undefined || updateData.status !== undefined) {
      try {
        await reconcileChatMembershipForUser(id);
      } catch (error) {
        console.error('[users] Failed to reconcile chat membership:', error);
      }
    }

    // Re-stamp denormalized chat author fields on this user's OLD messages so
    // they don't keep showing a stale name/role forever. Only when something
    // actually changed to a new value; a backfill failure must never roll
    // back the profile update itself (already committed above).
    const nameChanged = !!trimmedDisplayName && trimmedDisplayName !== existingDisplayName;
    const newEffectiveRole =
      role !== undefined ? role : fieldRole !== undefined ? fieldRole : undefined;
    const existingEffectiveRole = existingRole ?? existingFieldRole;
    const roleChanged = newEffectiveRole !== undefined && newEffectiveRole !== existingEffectiveRole;
    if (nameChanged || roleChanged) {
      try {
        await restampAuthor(id, {
          ...(nameChanged ? { authorName: trimmedDisplayName } : {}),
          ...(roleChanged ? { authorRole: newEffectiveRole ?? null } : {}),
        });
      } catch (error) {
        console.error('[users] Failed to re-stamp chat author fields:', error);
      }
    }

    // Re-stamp every other denormalized display-name copy whenever a
    // non-empty name is provided, even when it equals the stored name. This
    // lets an admin re-save a user to backfill records that were stale before
    // this propagation existed; failures remain fail-soft like chat restamps.
    if (trimmedDisplayName) {
      try {
        await restampDisplayName(id, trimmedDisplayName);
      } catch (error) {
        console.error('[users] Failed to re-stamp denormalized display names:', error);
      }
    }

    if (shouldKickoffChecklist) {
      const updatedDisplayName =
        (displayName as string | undefined) ??
        (doc.get('displayName') as string | undefined) ??
        (doc.get('email') as string | undefined) ??
        'Rep';
      await kickoffOnboardingChecklist(id, updatedDisplayName, '[users]');
    }

    if (shouldActivateImmediately) {
      try {
        await Promise.all([
          resolveAlertTasks(id, ['pending_assignment']),
          dispatchToUser({
            userId: id,
            type: 'system',
            title: 'Your account is active',
            message: 'Your account is active and ready to use.',
            link: '/portal',
          }),
        ]);
      } catch (error) {
        console.error('[users] activation notification failed:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/auth/users/[id] - Permanently delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: 'Firebase Admin is not configured' },
        { status: 500 }
      );
    }

    // Deleting is irreversible (Auth account, profile, SSN/DL and licence
    // photos), so it is admin/owner only, matching RolePermissions users:delete.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (!gate.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: only an admin can delete a user' },
        { status: 403 }
      );
    }
    // Don't let a caller delete their own account out from under themselves.
    if (gate.uid === id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('users').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // An owner may only be removed by an owner.
    const targetRole = doc.get('role') as PlatformRole | undefined;
    if (targetRole === 'owner' && !gate.isOwner) {
      return NextResponse.json(
        { error: 'Forbidden: only an owner can delete an owner account' },
        { status: 403 }
      );
    }

    // Delete user from Firebase Auth. An account whose Auth record is already gone
    // (a failed signup, a half-finished earlier delete) must still be removable, so
    // only "user not found" is tolerated; every other Auth error stays fatal.
    try {
      await adminAuth.deleteUser(id);
    } catch (error) {
      const authGone = typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/user-not-found';
      if (!authGone) throw error;
    }

    // The person's encrypted SSN / licence number and their licence photos go
    // BEFORE the profile does. Signed paperwork (W-9, contract, direct deposit)
    // and the checklist history stay: they are business records, and
    // Decommission keeps them too. The purge needs the profile (it records the
    // invite the hire came through), and if any step fails the profile is kept
    // so pressing Delete again finishes the job: the Auth step above already
    // tolerates an account that is gone.
    const purge = await purgeSensitiveUserData(id);
    const deletedRole = doc.get('fieldRole') ?? doc.get('role') ?? null;
    const auditDelete = (completed: boolean) =>
      writeAdminAudit({
        action: 'user.delete',
        actorUid: gate.uid,
        actorName: gate.name,
        targetUid: id,
        targetName: doc.get('displayName') || undefined,
        details: {
          completed,
          role: deletedRole,
          status: doc.get('status') ?? null,
          purge: { userSensitive: purge.userSensitive, files: purge.files, failures: purge.failures },
        },
      });

    if (purge.failures.length > 0) {
      // The login is already gone; take the profile out of People, the Board and
      // chat counts until the retry finishes, and say why. Best-effort: the
      // admin is told to press Delete again either way.
      try {
        await docRef.update({ status: 'inactive', deleteIncomplete: true, updatedAt: new Date() });
      } catch (error) {
        console.error('Delete user: failed to mark the incomplete delete', id, error);
      }
      await auditDelete(false);
      return NextResponse.json(
        {
          error:
            "The account is closed, but some ID documents could not be removed yet. Press Delete again to finish.",
          purgeFailures: purge.failures,
        },
        { status: 500 }
      );
    }

    await docRef.delete();

    // Their open alerts go with them. A "needs a position" task re-nags every
    // admin daily until resolved, and nothing else resolves it once the
    // account is gone — one deleted bot signup emailed Jacob for ten days.
    // Best-effort: the account is already deleted, so a failure here must not
    // turn a finished delete into an error.
    try {
      await resolveAlertTasks(id);
    } catch (error) {
      console.error('Delete user: failed to resolve open alerts', id, error);
    }

    await auditDelete(true);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
