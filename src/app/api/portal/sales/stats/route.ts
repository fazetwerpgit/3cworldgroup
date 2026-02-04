import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// GET /api/portal/sales/stats - Get sales statistics
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const salesRepId = searchParams.get('salesRepId');
    const period = searchParams.get('period') || 'month'; // day, week, month, year

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Base query
    let query = adminDb
      .collection('sales')
      .where('saleDate', '>=', startDate);

    if (salesRepId) {
      query = query.where('salesRepId', '==', salesRepId);
    }

    const snapshot = await query.get();

    let totalSales = 0;
    let totalValue = 0;
    let totalPoints = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let approvedPoints = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
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
    });

    // Get previous period stats for comparison
    let previousStartDate: Date;
    let previousEndDate = startDate;

    switch (period) {
      case 'day':
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 1);
        break;
      case 'week':
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        break;
      case 'year':
        previousStartDate = new Date(startDate);
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
        break;
      case 'month':
      default:
        previousStartDate = new Date(startDate);
        previousStartDate.setMonth(previousStartDate.getMonth() - 1);
        break;
    }

    let previousQuery = adminDb
      .collection('sales')
      .where('saleDate', '>=', previousStartDate)
      .where('saleDate', '<', previousEndDate);

    if (salesRepId) {
      previousQuery = previousQuery.where('salesRepId', '==', salesRepId);
    }

    const previousSnapshot = await previousQuery.get();
    let previousTotalPoints = 0;
    let previousTotalSales = 0;

    previousSnapshot.forEach((doc) => {
      const data = doc.data();
      previousTotalSales++;
      if (data.status === 'approved') {
        previousTotalPoints += data.totalPoints || 0;
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
      startDate,
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
