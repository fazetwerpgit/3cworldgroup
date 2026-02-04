import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// PUT /api/portal/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, displayName, phone } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Only allow updating specific fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (displayName !== undefined) {
      updates.displayName = displayName.trim();
    }

    if (phone !== undefined) {
      updates.phone = phone.trim();
    }

    await adminDb.collection('users').doc(userId).update(updates);

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
