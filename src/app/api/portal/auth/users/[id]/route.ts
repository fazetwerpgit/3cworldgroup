import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  User,
  PlatformRole,
  FieldRole,
  FieldRoles,
  roleRequiresOnboarding,
  resolveRoles,
} from '@/types';
import { requireManagement } from '@/lib/auth/requireManagement';
import { validateAddress } from '@/lib/validation/address';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { appBaseUrl, checklistReadyEmail } from '@/lib/email/templates';
import { restampAuthor } from '@/lib/chat/restampAuthor';
import { restampDisplayName } from '@/lib/users/restampDisplayName';

const VALID_STATUSES = ['active', 'inactive', 'pending'];

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
    const gate = await requireManagement(
      request.nextUrl.searchParams.get('requestedBy')
    );
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

    const body = await request.json();
    const { requestedBy, displayName, role, fieldRole, managerId, territoryId, phone, status, address, city, state, zip } = body;

    // Only admin/operations may edit users (incl. changing roles/status).
    const gate = await requireManagement(requestedBy);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const docRef = adminDb.collection('users').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const existingFieldRole = doc.get('fieldRole') as FieldRole | undefined;
    const existingRole = doc.get('role') as PlatformRole | undefined;
    const existingDisplayName = doc.get('displayName') as string | undefined;

    // Validate roles if provided: `role` is platform-only, `fieldRole` is field-only
    const validPlatformRoles: PlatformRole[] = ['admin', 'operations'];
    const validFieldRoles: FieldRole[] = Object.values(FieldRoles);
    if (role && fieldRole) {
      return NextResponse.json(
        { error: 'Provide either role (platform) or fieldRole (field sales), not both' },
        { status: 400 }
      );
    }
    if (role && !validPlatformRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }
    if (fieldRole && !validFieldRoles.includes(fieldRole)) {
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
    if (managerId !== undefined) updateData.managerId = managerId;
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
    const shouldKickoffChecklist =
      fieldRole === 'entry_level_rep' && existingFieldRole !== 'entry_level_rep';
    const assigningRole = role !== undefined || fieldRole !== undefined;
    const shouldActivateImmediately =
      assigningRole &&
      status === undefined &&
      doc.get('status') === 'pending' &&
      !roleRequiresOnboarding(fieldRole);
    if (shouldActivateImmediately) updateData.status = 'active';

    // Update displayName in Firebase Auth if changed
    if (trimmedDisplayName) {
      await adminAuth.updateUser(id, { displayName: trimmedDisplayName });
    }

    await docRef.update(updateData);

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
      try {
        await Promise.all([
          resolveAlertTasks(id, ['pending_assignment']),
          dispatchToUser({
            userId: id,
            type: 'system',
            title: 'Your onboarding checklist is ready',
            message: 'Your position was assigned. Complete your checklist to go active.',
            link: '/portal/onboarding',
            email: checklistReadyEmail({
              name: updatedDisplayName,
              portalUrl: `${appBaseUrl()}/portal/onboarding`,
            }),
          }),
        ]);
      } catch (error) {
        console.error('[users] checklist kickoff notification failed:', error);
      }

      void sendPendingEsignDocs(id).catch((err) =>
        console.error('[users] esign kickoff failed', err)
      );
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

    // Only admin/operations may delete users.
    const gate = await requireManagement(
      request.nextUrl.searchParams.get('requestedBy')
    );
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    // Don't let a caller delete their own account out from under themselves.
    if (gate.requester.uid === id) {
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

    // Delete user from Firebase Auth
    await adminAuth.deleteUser(id);

    // Delete user document from Firestore
    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
