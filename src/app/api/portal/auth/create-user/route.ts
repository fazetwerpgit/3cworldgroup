import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { UserRole } from '@/types';

// POST /api/portal/auth/create-user - Create a new user
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
      email,
      password,
      displayName,
      role,
      managerId,
      territoryId,
      phone,
    } = body;

    // Validate required fields
    if (!email || !password || !displayName || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, displayName, role' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: UserRole[] = ['admin', 'operations', 'sales_manager', 'sales_rep'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    // Create user profile in Firestore
    const userProfile = {
      email,
      displayName,
      role,
      managerId: managerId || null,
      territoryId: territoryId || null,
      phone: phone || '',
      status: 'active',
      hireDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await adminDb.collection('users').doc(userRecord.uid).set(userProfile);

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
