import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { PlatformRole, FieldRole, FieldRoles } from '@/types';
import { requireManagement } from '@/lib/auth/requireManagement';
import { validateAddress } from '@/lib/validation/address';

// POST /api/portal/auth/create-user - Create a new user (management only)
export async function POST(request: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin is not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      requestedBy,
      email,
      password,
      displayName,
      role,
      fieldRole,
      managerId,
      territoryId,
      phone,
      address,
      city,
      state,
      zip,
    } = body;

    // Only admin/operations may create users (and assign roles).
    const gate = await requireManagement(requestedBy);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Validate required fields - exactly one of role (platform) or
    // fieldRole (field sales) must be provided
    if (!email || !password || !displayName || (!role && !fieldRole)) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, displayName, role or fieldRole' },
        { status: 400 }
      );
    }
    if (role && fieldRole) {
      return NextResponse.json(
        { error: 'Provide either role (platform) or fieldRole (field sales), not both' },
        { status: 400 }
      );
    }

    // Validate roles: `role` is platform-only, `fieldRole` is field-only
    const validPlatformRoles: PlatformRole[] = ['admin', 'operations'];
    const validFieldRoles: FieldRole[] = Object.values(FieldRoles);
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

    const addressCheck = validateAddress({ address, city, state, zip });
    if (!addressCheck.ok) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 });
    }

    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    // Create user profile in Firestore - role kind determines which field is set
    const userProfile = {
      email,
      displayName,
      ...(role ? { role } : { fieldRole }),
      managerId: managerId || null,
      territoryId: territoryId || null,
      phone: phone || '',
      ...addressCheck.clean,
      status: 'active',
      hireDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // If the Firestore profile write fails, roll back the Auth user so we
    // don't leave an orphaned login with no profile.
    try {
      await adminDb.collection('users').doc(userRecord.uid).set(userProfile);
    } catch (profileError) {
      await adminAuth.deleteUser(userRecord.uid).catch((rollbackError) => {
        console.error('Failed to roll back orphaned Auth user:', rollbackError);
      });
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      user: {
        uid: userRecord.uid,
        ...userProfile,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating user:', error);

    // Handle Firebase Auth errors
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string };
      if (firebaseError.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 400 }
        );
      }
      if (firebaseError.code === 'auth/invalid-password') {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
