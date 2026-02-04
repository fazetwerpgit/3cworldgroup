import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

// POST /api/portal/auth/signup - Register new employee as sales_rep
export async function POST(request: NextRequest) {
  try {
    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: 'Firebase not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, password, displayName } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || email.split('@')[0],
    });

    // Create Firestore user profile with sales_rep role
    const userProfile = {
      email,
      displayName: displayName || email.split('@')[0],
      role: 'sales_rep', // Default role - admin can change later
      status: 'active',
      hireDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await adminDb.collection('users').doc(userRecord.uid).set(userProfile);

    // Send welcome notification
    await adminDb.collection('notifications').add({
      userId: userRecord.uid,
      type: 'announcement',
      title: 'Welcome to 3C World Group! 🎉',
      message: 'Your account is ready. Start logging sales to earn points!',
      link: '/portal/sales/new',
      read: false,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating user:', error);

    // Handle specific Firebase errors
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string };
      if (firebaseError.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 400 }
        );
      }
      if (firebaseError.code === 'auth/invalid-email') {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }
      if (firebaseError.code === 'auth/weak-password') {
        return NextResponse.json(
          { error: 'Password is too weak' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
