import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Sale, SaleStatus } from '@/types';

// Helper function to create a notification
async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  if (!adminDb) return;

  try {
    await adminDb.collection('notifications').add({
      userId,
      type,
      title,
      message,
      link,
      metadata: {},
      read: false,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// GET /api/portal/sales - Get sales with optional filters
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as SaleStatus | null;
    const salesRepId = searchParams.get('salesRepId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = adminDb.collection('sales').orderBy('createdAt', 'desc');

    if (status) {
      query = query.where('status', '==', status);
    }

    if (salesRepId) {
      query = query.where('salesRepId', '==', salesRepId);
    }

    const snapshot = await query.limit(limit).get();
    const sales: Sale[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      sales.push({
        id: doc.id,
        ...data,
        saleDate: data.saleDate?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
        approvedAt: data.approvedAt?.toDate(),
      } as Sale);
    });

    return NextResponse.json({ sales });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales' },
      { status: 500 }
    );
  }
}

// POST /api/portal/sales - Create a new sale
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      salesRepId,
      salesRepName,
      managerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      saleType,
      products,
      totalValue,
      totalPoints,
      notes,
    } = body;

    // Validate required fields - only address and products are required
    if (!salesRepId || !customerAddress || !products || products.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: salesRepId, customerAddress, products' },
        { status: 400 }
      );
    }

    const newSale = {
      salesRepId,
      salesRepName: salesRepName || '',
      managerId: managerId || null,
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      customerEmail: customerEmail || '',
      customerAddress,
      saleType: saleType || 'new_service',
      products,
      totalValue: totalValue || 0,
      totalPoints: totalPoints || 0,
      status: 'approved' as SaleStatus, // Auto-approved - no approval needed
      saleDate: new Date(),
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      approvedAt: new Date(), // Auto-approved timestamp
    };

    const docRef = await adminDb.collection('sales').add(newSale);

    // Send confirmation notification with points earned
    const pointsEarned = totalPoints || 0;
    await createNotification(
      salesRepId,
      'sale_approved',
      'Sale Recorded! 🎉',
      `Your sale has been logged.${pointsEarned > 0 ? ` You earned ${pointsEarned} points!` : ''}`,
      `/portal/sales/${docRef.id}`
    );

    // Also send points notification if they earned points
    if (pointsEarned > 0) {
      await createNotification(
        salesRepId,
        'points_earned',
        `+${pointsEarned} Points Earned`,
        'Great job! Check the leaderboard to see your ranking.',
        '/portal/leaderboard'
      );
    }

    return NextResponse.json({
      success: true,
      sale: {
        id: docRef.id,
        ...newSale,
      },
    });
  } catch (error) {
    console.error('Error creating sale:', error);
    return NextResponse.json(
      { error: 'Failed to create sale' },
      { status: 500 }
    );
  }
}
