import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { isShirtSize } from '@/types/auth';
import { restampAuthor } from '@/lib/chat/restampAuthor';
import { restampDisplayName } from '@/lib/users/restampDisplayName';

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
    const { displayName, phone, shirtSize } = body;

    if (shirtSize !== undefined && !isShirtSize(shirtSize)) {
      return NextResponse.json({ error: 'Pick a shirt size from the list' }, { status: 400 });
    }

    const trimmedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    if (displayName !== undefined && !trimmedDisplayName) {
      return NextResponse.json({ error: 'Enter your name' }, { status: 400 });
    }

    // Only allow updating specific fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (trimmedDisplayName) {
      updates.displayName = trimmedDisplayName;
    }

    if (phone !== undefined) {
      updates.phone = phone.trim();
    }

    if (shirtSize !== undefined) {
      updates.shirtSize = shirtSize;
    }

    const docRef = adminDb.collection('users').doc(userId);
    const existingDisplayName = trimmedDisplayName
      ? ((await docRef.get()).get('displayName') as string | undefined)
      : undefined;

    await docRef.update(updates);

    // Same propagation as the admin edit (users/[id]): the Auth name, chat
    // authorship and every denormalized copy (sales, leaderboard, forms).
    // Fail-soft: the profile update is already committed.
    if (trimmedDisplayName && trimmedDisplayName !== existingDisplayName) {
      try {
        await adminAuth?.updateUser(userId, { displayName: trimmedDisplayName });
      } catch (error) {
        console.error('[profile] Failed to update auth displayName:', error);
      }
      try {
        await restampAuthor(userId, { authorName: trimmedDisplayName });
      } catch (error) {
        console.error('[profile] Failed to re-stamp chat author fields:', error);
      }
      try {
        await restampDisplayName(userId, trimmedDisplayName);
      } catch (error) {
        console.error('[profile] Failed to re-stamp denormalized display names:', error);
      }
    }

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
