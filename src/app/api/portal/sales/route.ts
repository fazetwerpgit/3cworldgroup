import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initError } from '@/lib/firebase/admin';
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
        { error: 'Database not configured', details: initError || 'adminDb is null' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as SaleStatus | null;
    const salesRepId = searchParams.get('salesRepId');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build query - avoid compound indexes by filtering in memory
    const salesRef = adminDb.collection('sales');

    // Use only one filter in the query, filter rest in memory
    // Add limit to prevent memory issues with large datasets
    const maxFetch = Math.min(limit * 2, 500); // Cap at 500 to prevent memory issues
    const snapshot = salesRepId
      ? await salesRef.where('salesRepId', '==', salesRepId).limit(maxFetch).get()
      : await salesRef.limit(maxFetch).get();
    let sales: Sale[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Filter by status in memory if needed
      if (status && data.status !== status) {
        return;
      }

      sales.push({
        id: doc.id,
        ...data,
        saleDate: data.saleDate?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
        approvedAt: data.approvedAt?.toDate(),
      } as Sale);
    });

    // Sort by createdAt descending
    sales.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // Apply limit
    sales = sales.slice(0, limit);

    return NextResponse.json({ sales });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/portal/sales - Create a new sale
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured', details: initError || 'adminDb is null' },
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

    // Calculate points server-side based on products to prevent cheating
    let calculatedPoints = 0;
    if (Array.isArray(products)) {
      for (const product of products) {
        calculatedPoints += product.points || 0;
      }
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
      totalPoints: calculatedPoints, // Server-calculated, not from client
      status: 'pending' as SaleStatus, // Requires approval
      saleDate: new Date(),
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection('sales').add(newSale);

    // Send confirmation notification - sale is pending approval
    await createNotification(
      salesRepId,
      'sale_submitted',
      'Sale Submitted! 📋',
      'Your sale has been submitted and is pending approval from your manager.',
      `/portal/sales/${docRef.id}`
    );

    // Notify manager if one is assigned
    if (managerId) {
      await createNotification(
        managerId,
        'sale_pending',
        'New Sale Needs Approval',
        `${salesRepName || 'A team member'} submitted a new sale for review.`,
        '/portal/approvals'
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
      { error: 'Failed to create sale', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
