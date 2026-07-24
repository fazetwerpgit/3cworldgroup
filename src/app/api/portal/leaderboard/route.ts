import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import {
  computeHistory,
  dayKey,
  type HistoryEnrichment,
  type SaleRecord,
} from '@/lib/leaderboard/history';

// GET /api/portal/leaderboard - Get leaderboard data (points-based)
export async function GET(request: NextRequest) {
  try {
    // Require a verified login — the standings are internal team data.
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'month';
    const metric = searchParams.get('metric') || 'totalPoints';
    const limit = parseInt(searchParams.get('limit') || '10');
    // 'submitted' also counts pending sales — the weekly challenge tracks
    // sales as reps log them, without waiting on admin approval. Rankings
    // and points stay approved-only (the default).
    const scope = searchParams.get('scope') === 'submitted' ? 'submitted' : 'approved';

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Get approved sales - filter by date in code to avoid compound index requirement
    // Limit to prevent memory issues with large datasets
    const salesSnapshot = await adminDb
      .collection('sales')
      .where('status', scope === 'submitted' ? 'in' : '==', scope === 'submitted' ? ['pending', 'approved'] : 'approved')
      .limit(5000)
      .get();

    // Convert startDate to timestamp for comparison
    const startTimestamp = startDate.getTime();

    // Aggregate by sales rep - now tracking points instead of revenue
    const salesByRep: Record<string, {
      salesRepId: string;
      salesRepName: string;
      totalSales: number;
      totalPoints: number;
    }> = {};

    const allSales: SaleRecord[] = [];
    const periodSales: SaleRecord[] = [];

    salesSnapshot.forEach((doc) => {
      const sale = doc.data();

      const saleDate = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate);
      const record: SaleRecord = {
        salesRepId: sale.salesRepId,
        saleDate,
        totalPoints: sale.totalPoints || 0,
      };
      allSales.push(record);

      // Filter by date in code (avoids needing composite index)
      if (saleDate.getTime() < startTimestamp) {
        return; // Skip sales before the period
      }
      periodSales.push(record);

      const repId = sale.salesRepId;

      if (!salesByRep[repId]) {
        salesByRep[repId] = {
          salesRepId: repId,
          salesRepName: sale.salesRepName || 'Unknown',
          totalSales: 0,
          totalPoints: 0,
        };
      }

      salesByRep[repId].totalSales += 1;
      salesByRep[repId].totalPoints += sale.totalPoints || 0;
    });

    // Convert to array and sort by metric
    const leaderboard = Object.values(salesByRep);

    switch (metric) {
      case 'totalSales':
        leaderboard.sort((a, b) => b.totalSales - a.totalSales);
        break;
      case 'totalPoints':
      default:
        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
        break;
    }

    // Rank the FULL sorted list first, so the caller's rank is correct even when
    // they fall below the returned top-N cutoff.
    const fullyRanked = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));

    // Phase 2: rank history (movement vs yesterday, 7-day spark, streaks).
    // Fail-soft — a history bug must never take down the leaderboard.
    let history: Map<string, HistoryEnrichment> | null = null;
    try {
      history = computeHistory({
        periodSales,
        allSales,
        currentRanks: new Map(fullyRanked.map((e) => [e.salesRepId, e.rank])),
        periodStartKey: dayKey(startDate),
        metric: metric === 'totalSales' ? 'totalSales' : 'totalPoints',
        now: new Date(),
      });
    } catch (historyError) {
      console.error('Leaderboard history enrichment failed:', historyError);
    }

    const withHistory = <T extends { salesRepId: string }>(entry: T) => {
      const h = history?.get(entry.salesRepId);
      return {
        ...entry,
        movement: h?.movement ?? null,
        spark: h?.spark ?? [],
        streakDays: h?.streakDays ?? 0,
      };
    };

    const rankedLeaderboard = fullyRanked.slice(0, limit).map(withHistory);

    // The caller's own standing (null if they have no approved sales this period).
    const rawCurrentUser = fullyRanked.find((e) => e.salesRepId === gate.uid) ?? null;

    return NextResponse.json({
      period,
      metric,
      startDate,
      leaderboard: rankedLeaderboard,
      totalRanked: fullyRanked.length,
      currentUser: rawCurrentUser ? withHistory(rawCurrentUser) : null,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
