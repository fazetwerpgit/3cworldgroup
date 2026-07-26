import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

// PUT /api/portal/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // A hired rep filling out onboarding must be able to set their own name and
    // phone; the shared API allowlist admits that pending stage.
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    // Profile edits are always self-service — the target is the verified caller,
    // never a client-supplied userId.
    const userId = gate.uid;

    const body = await request.json();
    const { displayName, phone } = body;

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
