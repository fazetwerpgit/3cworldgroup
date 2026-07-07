import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { User, PlatformRole, FieldRole, FieldRoles, resolveRoles } from '@/types';
import { requireManagement } from '@/lib/auth/requireManagement';
import { validateAddress } from '@/lib/validation/address';

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

    if (displayName !== undefined) updateData.displayName = displayName;
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

    // Update displayName in Firebase Auth if changed
    if (displayName) {
      await adminAuth.updateUser(id, { displayName });
    }

    await docRef.update(updateData);

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
