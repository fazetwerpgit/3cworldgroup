import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { User, UserRole } from '@/types';

// GET /api/portal/auth/users/[id] - Get a single user
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

    const doc = await adminDb.collection('users').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = doc.data();
    const user: User = {
      uid: doc.id,
      email: data?.email,
      displayName: data?.displayName,
      role: data?.role,
      managerId: data?.managerId,
      territoryId: data?.territoryId,
      phone: data?.phone,
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
    const { displayName, role, managerId, territoryId, phone, status } = body;

    const docRef = adminDb.collection('users').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate role if provided
    if (role) {
      const validRoles: UserRole[] = ['admin', 'operations', 'sales_manager', 'sales_rep'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (displayName !== undefined) updateData.displayName = displayName;
    if (role !== undefined) updateData.role = role;
    if (managerId !== undefined) updateData.managerId = managerId;
    if (territoryId !== undefined) updateData.territoryId = territoryId;
    if (phone !== undefined) updateData.phone = phone;
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

// DELETE /api/portal/auth/users/[id] - Disable a user (soft delete)
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

    const docRef = adminDb.collection('users').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Disable user in Firebase Auth
    await adminAuth.updateUser(id, { disabled: true });

    // Set status to inactive in Firestore
    await docRef.update({
      status: 'inactive',
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
