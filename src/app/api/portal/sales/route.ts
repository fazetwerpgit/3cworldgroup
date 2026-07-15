import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initError } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { getRequester } from '@/lib/auth/requireManagement';
import { Sale, SaleStatus } from '@/types';
import { hasSaleProof } from '@/lib/sales/proof';
import { parseSaleDateInput, parseInstallDateInput } from '@/lib/sales/saleDate';

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

    // Sales rows carry customer PII — require a verified login, and scope
    // non-management callers to their own sales server-side (never trust the
    // client's filter for that).
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const requester = await getRequester(gate.uid);
    if (!requester) {
      return NextResponse.json({ error: 'Caller not found' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as SaleStatus | null;
    const salesRepId = requester.isManagement
      ? searchParams.get('salesRepId')
      : gate.uid;
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
        installDate: data.installDate?.toDate(),
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

    // Creating a sale writes a row under a rep's identity; require a verified
    // token and stamp the rep from it — never trust a client-supplied salesRepId.
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const salesRepId = gate.uid;
    const salesRepName = gate.name;

    // Derive the approving manager from the rep's own profile server-side — never
    // trust a client-supplied managerId (it routes the approval notification).
    const repSnap = await adminDb.collection('users').doc(salesRepId).get();
    const managerId = repSnap.data()?.reportsToId || null;

    const body = await request.json();
    const {
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      saleType,
      products,
      totalValue,
      notes,
      orderNumberOrBtn,
      proofScreenshotPath,
      productSold,
      saleDate,
      installDate,
    } = body;

    // Validate required fields - only address and products are required
    if (!customerAddress || !products || products.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: customerAddress, products' },
        { status: 400 }
      );
    }

    if (!productSold || !String(productSold).trim()) {
      return NextResponse.json({ error: 'Product sold is required' }, { status: 400 });
    }

    if (!hasSaleProof({ orderNumberOrBtn, proofScreenshotPath })) {
      return NextResponse.json(
        { error: 'Provide an order number / BTN or upload a screenshot' },
        { status: 400 }
      );
    }

    // Sale date is user-editable but optional for backward compatibility with
    // older clients — fall back to now when omitted, reject when malformed.
    let resolvedSaleDate = new Date();
    if (saleDate !== undefined && saleDate !== null && saleDate !== '') {
      const parsed = parseSaleDateInput(saleDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      resolvedSaleDate = parsed.date;
    }

    // Install date is required on the form but optional server-side for
    // backward compatibility with older clients — stored null when omitted.
    let resolvedInstallDate: Date | null = null;
    if (installDate !== undefined && installDate !== null && installDate !== '') {
      const parsed = parseInstallDateInput(installDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      resolvedInstallDate = parsed.date;
    }

    if (proofScreenshotPath) {
      const expectedPrefix = `form-attachments/${salesRepId}/sale-proof/`;
      if (!String(proofScreenshotPath).startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: 'Invalid screenshot reference' },
          { status: 400 }
        );
      }
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
      saleDate: resolvedSaleDate,
      installDate: resolvedInstallDate,
      notes: notes || '',
      orderNumberOrBtn: orderNumberOrBtn || '',
      proofScreenshotPath: proofScreenshotPath || '',
      productSold: productSold || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection('sales').add(newSale);

    // Send confirmation notification - sale is pending approval
    await createNotification(
      salesRepId,
      'sale_submitted',
      'Sale Submitted! 📋',
      'Your sale has been submitted and is pending review.',
      `/portal/sales/${docRef.id}`
    );

    // Notify all admin/operations users (sales review is platform-only now).
    try {
      const reviewersSnap = await adminDb
        .collection('users')
        .where('role', 'in', ['admin', 'operations'])
        .get();
      await Promise.all(
        reviewersSnap.docs.map((reviewerDoc) =>
          createNotification(
            reviewerDoc.id,
            'sale_pending',
            'New Sale Needs Approval',
            `${salesRepName || 'A team member'} submitted a new sale for review.`,
            '/portal/sales?status=pending'
          )
        )
      );
    } catch (error) {
      console.error('Error notifying reviewers of new sale:', error);
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
