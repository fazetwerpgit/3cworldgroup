import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  getOnboardingItemsForUser,
  resolveRoles,
  OnboardingStatus,
} from '@/types';
import {
  requireVerifiedManagement,
  requireVerifiedUser,
} from '@/lib/auth/requireVerifiedAdmin';

// GET /api/portal/onboarding?userId=xxx - Merged onboarding checklist for a user.
// Returns the items that apply to the user's fieldRole/isIBO, each merged with
// their progress doc from the `userOnboarding` collection (doc id: userId_itemId).
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // A user may read their own checklist; management may read anyone's. The
    // caller is authenticated from the token before anything else; `userId` below
    // is the TARGET (whose checklist), never the identity.
    //
    // The self path uses requireVerifiedUser with { allowOnboarding: true }
    // rather than requireVerifiedSelfOrManagement, which is active-only: a hired
    // rep is status 'pending' with a field role for the whole onboarding flow
    // (created pending at api/public/onboarding/[token]/route.ts:227, flipped to
    // active only once every item is approved — lib/onboarding/activation.ts),
    // so the active-only helper would lock every new hire out of their own
    // checklist. The opt-in admits pending-with-a-field-role only: never an
    // unapproved self-signup, never a deactivated account.
    const self = await requireVerifiedUser(request, { allowOnboarding: true });
    if (!self.ok) {
      return NextResponse.json({ error: self.error }, { status: self.status });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Reading someone else's checklist is management-only.
    if (self.uid !== userId) {
      const management = await requireVerifiedManagement(request);
      if (!management.ok) {
        return NextResponse.json(
          { error: management.error },
          { status: management.status }
        );
      }
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const { fieldRole } = resolveRoles(userData?.role, userData?.fieldRole);

    // Onboarding applies to field sales users only - platform users get an empty list
    if (!fieldRole) {
      return NextResponse.json({ items: [], fieldRole: null, isIBO: false });
    }

    const isIBO = userData?.isIBO ?? false;
    const checklist = getOnboardingItemsForUser(fieldRole, isIBO);

    // Fetch all progress docs for this user in one batch read
    const refs = checklist.map((item) =>
      adminDb!.collection('userOnboarding').doc(`${userId}_${item.id}`)
    );
    const progressDocs = refs.length > 0 ? await adminDb.getAll(...refs) : [];

    const items = checklist.map((item, i) => {
      const progress = progressDocs[i]?.exists ? progressDocs[i].data() : null;
      return {
        ...item,
        status: (progress?.status ?? 'not_started') as OnboardingStatus,
        reference: progress?.reference ?? null,
        rejectionReason: progress?.rejectionReason ?? null,
        reviewerName: progress?.reviewerName ?? null,
        submittedAt: progress?.submittedAt?.toDate() ?? null,
        reviewedAt: progress?.reviewedAt?.toDate() ?? null,
      };
    });

    const approvedCount = items.filter((i) => i.status === 'approved').length;

    return NextResponse.json({
      items,
      fieldRole,
      isIBO,
      progress: {
        approved: approvedCount,
        total: items.length,
        complete: approvedCount === items.length,
      },
    });
  } catch (error) {
    console.error('Error fetching onboarding checklist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding checklist' },
      { status: 500 }
    );
  }
}
