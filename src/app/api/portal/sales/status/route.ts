import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { FiberOrder, FiberStatusResponse } from '@/types';
import { attachLoggedCustomerNames, LoggedSale } from '@/lib/fiberReport/matchSales';
import { getAllFiberOrders } from '@/lib/fiberReport/ordersCache';

function sortByOrderDate(orders: FiberOrder[]): FiberOrder[] {
  return [...orders].sort((a, b) => {
    const aDate = a.orderDate ?? '';
    const bDate = b.orderDate ?? '';
    return bDate.localeCompare(aDate);
  });
}

function toFiberOrder(id: string, data: FirebaseFirestore.DocumentData): FiberOrder {
  return { id, ...data } as FiberOrder;
}

function toLoggedSale(data: FirebaseFirestore.DocumentData): LoggedSale {
  return {
    salesRepId: data.salesRepId,
    customerName: data.customerName,
    customerAddress: data.customerAddress,
    createdAt: data.createdAt?.toDate?.() ?? null,
  };
}

// GET /api/portal/sales/status - Fiber install-status visibility scope.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const userId = gate.uid;
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data() ?? {};
    const scope: FiberStatusResponse['scope'] =
      userData.role === 'admin' || userData.role === 'owner' ? 'all' : 'own';

    const statusDoc = await adminDb.collection('config').doc('fiberReportStatus').get();
    const lastReportAt = statusDoc.exists
      ? (statusDoc.data()?.lastReportAt ?? null)
      : null;

    if (scope === 'own') {
      const snapshot = await adminDb
        .collection('fiberOrders')
        .where('matchedUserId', '==', userId)
        .get();
      const orders = sortByOrderDate(
        snapshot.docs.map((doc) => toFiberOrder(doc.id, doc.data()))
      );
      const salesSnapshot = await adminDb
        .collection('sales')
        .where('salesRepId', '==', userId)
        .get();
      const sales = salesSnapshot.docs.map((doc) => toLoggedSale(doc.data()));
      const ordersWithNames = attachLoggedCustomerNames(orders, sales);
      return NextResponse.json({
        scope,
        lastReportAt,
        orders: ordersWithNames,
        submittedTotal: salesSnapshot.docs.length,
      } satisfies FiberStatusResponse);
    }

    // The admin scope needs every order (see ordersCache for why no bound is
    // safe), so the whole-collection read is cached against lastReportAt rather
    // than narrowed. Per-instance on serverless: fewer reads, not zero.
    // `?fresh=1` — set by the client on the refetch that immediately follows a
    // link/assign/rematch write, so the answer cannot come from another
    // instance's pre-write snapshot. Ordinary loads stay cached.
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    const allOrders = await getAllFiberOrders(lastReportAt, { fresh });
    const matchedOrders = allOrders.filter((order) => order.matchedUserId !== null);
    const salesSnapshot = await adminDb.collection('sales').get();
    const sales = salesSnapshot.docs.map((doc) => toLoggedSale(doc.data()));
    const orders = sortByOrderDate(
      attachLoggedCustomerNames(matchedOrders, sales)
    );
    const unmatched = sortByOrderDate(
      allOrders.filter((order) => order.matchedUserId === null)
    );
    return NextResponse.json({ scope, lastReportAt, orders, unmatched } satisfies FiberStatusResponse);
  } catch (error) {
    console.error('Error fetching fiber status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fiber status' },
      { status: 500 }
    );
  }
}
