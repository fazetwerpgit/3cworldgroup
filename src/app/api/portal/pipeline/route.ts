import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import {
  resolveRoles,
  getOnboardingItemsForUser,
  PipelineRep,
  PipelineStage,
  PIPELINE_STAGE_ORDER,
} from '@/types';

// GET /api/portal/pipeline - Recruiting pipeline overview.
// Aggregates every field rep's onboarding progress, channel clearances and
// approved sales into a derived stage. Stage is computed, never stored, so
// it can't drift out of sync with the underlying data.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // The pipeline exposes the full field roster and HR data — management only,
    // verified from the token.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Whole-collection reads, aggregated in memory (team-sized data set -
    // same pattern as the users list API).
    const [usersSnap, onboardingSnap, channelsSnap, salesSnap, ordersSnap] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('userOnboarding').get(),
      adminDb.collection('userChannelOnboarding').get(),
      adminDb.collection('sales').where('status', '==', 'approved').get(),
      // Only who each carrier order belongs to: an order under a rep's dealer
      // code proves they have carrier logins, logged in the portal or not.
      adminDb.collection('fiberOrders').select('matchedUserId').get(),
    ]);

    // Index progress by userId
    const approvedItemsByUser = new Map<string, Set<string>>();
    const hasChecklistRecords = new Set<string>();
    for (const doc of onboardingSnap.docs) {
      const d = doc.data();
      hasChecklistRecords.add(d.userId);
      if (d.status === 'approved') {
        if (!approvedItemsByUser.has(d.userId)) approvedItemsByUser.set(d.userId, new Set());
        approvedItemsByUser.get(d.userId)!.add(d.itemId);
      }
    }

    const channelsByUser = new Map<string, { cleared: number; submitted: number }>();
    for (const doc of channelsSnap.docs) {
      const d = doc.data();
      const entry = channelsByUser.get(d.userId) ?? { cleared: 0, submitted: 0 };
      if (d.status === 'cleared') entry.cleared++;
      if (d.status === 'submitted') entry.submitted++;
      channelsByUser.set(d.userId, entry);
    }

    const salesByUser = new Map<string, number>();
    for (const doc of salesSnap.docs) {
      const repId = doc.data().salesRepId;
      if (repId) salesByUser.set(repId, (salesByUser.get(repId) ?? 0) + 1);
    }

    const carrierOrdersByUser = new Map<string, number>();
    for (const doc of ordersSnap.docs) {
      const repId = doc.data().matchedUserId;
      if (repId) carrierOrdersByUser.set(repId, (carrierOrdersByUser.get(repId) ?? 0) + 1);
    }

    // Display-name join for managers
    const nameById = new Map<string, string>();
    for (const doc of usersSnap.docs) {
      const d = doc.data();
      nameById.set(doc.id, d.displayName ?? d.email ?? doc.id);
    }

    const reps: PipelineRep[] = [];
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const { fieldRole } = resolveRoles(data.role, data.fieldRole);
      if (!fieldRole) continue; // pipeline tracks field sales users only

      const isIBO = data.isIBO ?? false;
      const checklist = getOnboardingItemsForUser(fieldRole, isIBO);
      const approvedSet = approvedItemsByUser.get(doc.id) ?? new Set();
      const approved = checklist.filter((item) => approvedSet.has(item.id)).length;
      const channels = channelsByUser.get(doc.id) ?? { cleared: 0, submitted: 0 };
      const approvedSales = salesByUser.get(doc.id) ?? 0;
      const carrierOrders = carrierOrdersByUser.get(doc.id) ?? 0;
      const decommission = data.decommission;
      // Channel clearances were barely ever recorded, so a rep who is already
      // selling (approved sales, or orders under their dealer code on the
      // carrier report) plainly has logins.
      const hasLogins = channels.cleared > 0 || approvedSales > 0 || carrierOrders > 0;

      let stage: PipelineStage;
      if (decommission || data.status === 'inactive') {
        stage = 'decommissioned';
      } else if (data.status !== 'active' && approved < checklist.length) {
        // An active rep is past onboarding even with no checklist records (made
        // active in People, or from before the checklist existed).
        stage = 'processing';
      } else if (!hasLogins) {
        stage = 'need_logins';
      } else if (approvedSales === 0 && carrierOrders === 0) {
        stage = 'cleared_to_sell';
      } else {
        stage = 'active';
      }

      const reportsToId = data.reportsToId ?? data.managerId ?? undefined;

      reps.push({
        uid: doc.id,
        displayName: data.displayName ?? data.email ?? doc.id,
        email: data.email ?? '',
        fieldRole,
        isIBO,
        reportsToId,
        managerName: reportsToId ? nameById.get(reportsToId) : undefined,
        stage,
        // Null for an active rep from before the checklist: there is nothing
        // to count, and "0/6" would read as unfinished paperwork.
        onboarding:
          data.status === 'active' && !hasChecklistRecords.has(doc.id) ? null : { approved, total: checklist.length },
        channelsCleared: channels.cleared,
        channelsSubmitted: channels.submitted,
        approvedSales,
        carrierOrders,
        hireDate: data.hireDate?.toDate(),
        decommission: decommission
          ? {
              ...decommission,
              decommissionedAt: decommission.decommissionedAt?.toDate?.() ?? null,
            }
          : undefined,
      });
    }

    // Summary counts per stage, in pipeline order
    const counts = Object.fromEntries(
      PIPELINE_STAGE_ORDER.map((stage) => [stage, reps.filter((r) => r.stage === stage).length])
    );

    return NextResponse.json({ reps, counts });
  } catch (error) {
    console.error('Error building pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to build pipeline' },
      { status: 500 }
    );
  }
}
