import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { chicagoDayBounds, periodBounds } from '@/lib/leaderboard/periods';

const STATS_PERIODS = ['day', 'week', 'month', 'year'] as const;
type StatsPeriod = (typeof STATS_PERIODS)[number];

/**
 * The period containing `at`, on Chicago's calendar like the leaderboard and
 * the rest of the portal (a Sunday-start week, calendar month and year). The
 * server's own timezone must not decide which month a sale belongs to.
 */
function boundsFor(period: StatsPeriod, at: Date) {
  if (period === 'day') return chicagoDayBounds(at);
  // periodBounds is null only for the all-time period, which StatsPeriod excludes.
  const bounds = periodBounds(period, at);
  if (!bounds) throw new Error(`No bounds for period ${period}`);
  return bounds;
}

// GET /api/portal/sales/stats - Get sales statistics
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Scope: a rep (and operations — own sales only) may only request their
    // own stats; admin/owner may request any rep's or org-wide (no salesRepId).
    // `salesRepId` is TARGET data — a non-admin caller must pass their own
    // uid, checked against the token.
    // The shared API allowlist excludes this route until the account is active.
    const requester = await requireVerifiedRequester(request);
    if (!requester.ok) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const searchParams = request.nextUrl.searchParams;
    const salesRepId = searchParams.get('salesRepId');
    const requested = searchParams.get('period') || 'month';
    const period: StatsPeriod = STATS_PERIODS.find((candidate) => candidate === requested) ?? 'month';

    if (!requester.isAdmin && salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only view your own stats' },
        { status: 403 }
      );
    }

    const current = boundsFor(period, new Date());
    // One millisecond before this period starts is, by definition, in the previous one.
    const previous = boundsFor(period, new Date(current.start.getTime() - 1));

    // Get all sales and filter in memory to avoid index requirements
    const salesRef = adminDb.collection('sales');

    const snapshot = salesRepId
      ? await salesRef.where('salesRepId', '==', salesRepId).get()
      : await salesRef.get();

    let totalSales = 0;
    let totalValue = 0;
    let totalPoints = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let approvedPoints = 0;
    let previousTotalSales = 0;
    let previousTotalPoints = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();

      // A cancelled sale is not a sale: it counts toward nothing, here or in the
      // previous period it is compared against.
      if (data.status === 'cancelled') return;

      const saleDate = data.saleDate?.toDate ? data.saleDate.toDate() : new Date(data.saleDate);
      const soldAt = saleDate.getTime();

      if (soldAt >= current.start.getTime() && soldAt < current.end.getTime()) {
        totalSales++;
        totalValue += data.totalValue || 0;
        totalPoints += data.totalPoints || 0;

        switch (data.status) {
          case 'pending':
            pendingCount++;
            break;
          case 'approved':
            approvedCount++;
            approvedPoints += data.totalPoints || 0;
            break;
          case 'rejected':
            rejectedCount++;
            break;
        }
      } else if (soldAt >= previous.start.getTime() && soldAt < previous.end.getTime()) {
        previousTotalSales++;
        if (data.status === 'approved') {
          previousTotalPoints += data.totalPoints || 0;
        }
      }
    });

    // Calculate percentage changes
    const salesChange = previousTotalSales > 0
      ? ((totalSales - previousTotalSales) / previousTotalSales) * 100
      : totalSales > 0 ? 100 : 0;

    const pointsChange = previousTotalPoints > 0
      ? ((approvedPoints - previousTotalPoints) / previousTotalPoints) * 100
      : approvedPoints > 0 ? 100 : 0;

    return NextResponse.json({
      period,
      startDate: current.start,
      stats: {
        totalSales,
        totalValue,
        totalPoints,
        approvedPoints,
        pendingCount,
        approvedCount,
        rejectedCount,
        salesChange: Math.round(salesChange * 10) / 10,
        pointsChange: Math.round(pointsChange * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error fetching sales stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales statistics' },
      { status: 500 }
    );
  }
}
