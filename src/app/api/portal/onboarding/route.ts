import { after, NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  getOnboardingItemsForUser,
  resolveRoles,
  OnboardingStatus,
} from '@/types';
import { requireVerifiedSelfOrManagement } from '@/lib/auth/requireVerifiedAdmin';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { isEsignItem } from '@/lib/onboarding/esign';

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

    // TARGET: whose checklist is read. Identity comes only from the token below.
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // A user may read their own checklist; management may read anyone's. The
    // shared API allowlist admits a hired rep still working through this
    // checklist, while the self/management check preserves record ownership.
    const gate = await requireVerifiedSelfOrManagement(request, userId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
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

    // Retry delivery after the response. sendPendingEsignDocs is failure-contained
    // and throttled, so a provider outage cannot delay or fail this checklist read.
    after(() =>
      sendPendingEsignDocs(userId).catch((error) => {
        console.error('[onboarding] esign auto-send failed', error);
      })
    );

    const isIBO = userData?.isIBO ?? false;
    const checklist = getOnboardingItemsForUser(fieldRole, isIBO);

    // Bearer capability: an embedded signing URL is only ever handed to the
    // checklist owner. Management viewing someone else's checklist gets null.
    const isOwner = gate.uid === userId;

    // Fetch all progress docs for this user in one batch read
    const refs = checklist.map((item) =>
      adminDb!.collection('userOnboarding').doc(`${userId}_${item.id}`)
    );
    const progressDocs = refs.length > 0 ? await adminDb.getAll(...refs) : [];

    // Signing URLs live in a server-only collection (no firestore.rules match,
    // so the client SDK can never read it). Only fetched for the owner, and
    // only for esign items, since management never needs it.
    const esignItems = checklist.filter((item) => isEsignItem(item.id));
    const signingUrlByItemId = new Map<string, string | null>();
    if (isOwner && esignItems.length > 0) {
      const signingRefs = esignItems.map((item) =>
        adminDb!.collection('esignSigningUrls').doc(`${userId}_${item.id}`)
      );
      const signingDocs = await adminDb.getAll(...signingRefs);
      signingDocs.forEach((doc, i) => {
        signingUrlByItemId.set(esignItems[i].id, doc.exists ? ((doc.data()?.url as string | undefined) ?? null) : null);
      });
    }

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
        esignDispatch: progress?.esignDispatch
          ? {
              state: progress.esignDispatch.state,
              attempts: progress.esignDispatch.attempts,
            }
          : null,
        esignSigningUrl: isOwner ? (signingUrlByItemId.get(item.id) ?? null) : null,
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
