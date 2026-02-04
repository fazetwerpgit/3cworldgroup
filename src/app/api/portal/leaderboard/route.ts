import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// GET /api/portal/leaderboard - Get leaderboard data (points-based)
export async function GET(request: NextRequest) {
  try {
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
    const salesSnapshot = await adminDb
      .collection('sales')
      .where('status', '==', 'approved')
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

    salesSnapshot.forEach((doc) => {
      const sale = doc.data();

      // Filter by date in code (avoids needing composite index)
      const saleDate = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate);
      if (saleDate.getTime() < startTimestamp) {
        return; // Skip sales before the period
      }

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
    let leaderboard = Object.values(salesByRep);

    switch (metric) {
      case 'totalSales':
        leaderboard.sort((a, b) => b.totalSales - a.totalSales);
        break;
      case 'totalPoints':
      default:
        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
        break;
    }

    // Add rankings
    const rankedLeaderboard = leaderboard.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({
      period,
      metric,
      startDate,
      leaderboard: rankedLeaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
