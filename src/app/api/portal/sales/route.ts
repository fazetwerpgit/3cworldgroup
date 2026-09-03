import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb, initError } from '@/lib/firebase/admin';
import { sendPushToUser } from '@/lib/push/sendPush';
import { requireVerifiedUser, requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { ADMIN_LEVEL_PLATFORM_ROLES, Sale, SaleStatus } from '@/types';
import { hasSaleProof } from '@/lib/sales/proof';
import { parseSaleDateInput, parseInstallDateInput } from '@/lib/sales/saleDate';

// Helper function to create a notification
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A YYYY-MM-DD query param as an inclusive day boundary. Anything unparseable
 * reads as "no bound" rather than throwing: a malformed date must widen the
 * result set, never silently return an empty month that looks like real data.
 */
function parseDayBound(value: string | null, edge: 'start' | 'end'): Date | null {
  if (!value || !DATE_ONLY_RE.test(value)) return null;
  const [, year, month, day] = DATE_ONLY_RE.exec(value)!;
  const date = edge === 'start'
    ? new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
    : new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A Date reduced to its local calendar day, for day-resolution comparisons. */
function startOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

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
    // This route remains active-only: the shared API allowlist intentionally
    // excludes pending hires because the ledger and approval queue are not
    // available to an unactivated account.
    const gate = await requireVerifiedRequester(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as SaleStatus | null;
    // `salesRepId` is an admin/owner-only FILTER (target data), never identity —
    // every other caller (operations included: they see only their own sales)
    // is pinned to their own token uid regardless of it.
    const salesRepId = gate.isAdmin
      ? searchParams.get('salesRepId')
      : gate.uid;
    const limit = parseInt(searchParams.get('limit') || '50');
    // Sale dates are stored at local noon, so a plain YYYY-MM-DD boundary taken
    // at midnight/end-of-day has ~12 hours of slack either side of whatever
    // timezone the server runs in — the day a sale lands on can't flip.
    const startDate = parseDayBound(searchParams.get('startDate'), 'start');
    const endDate = parseDayBound(searchParams.get('endDate'), 'end');

    // Build query - avoid compound indexes by filtering in memory
    const salesRef = adminDb.collection('sales');

    // Use only one filter in the query, filter rest in memory
    // Add limit to prevent memory issues with large datasets
    const maxFetch = Math.min(limit * 2, 500); // Cap at 500 to prevent memory issues

    // The admin board asks for one month at a time. Both predicates go into the
    // query. They used to be mutually exclusive — the rep filter won and the
    // dates were re-applied in memory over the maxFetch slice — to avoid a
    // composite index, but that quietly cut a long-booked rep's older months
    // off the board. The index now exists (firestore.indexes.json,
    // `sales`: salesRepId ASC + saleDate ASC), so both can run in Firestore.
    let query: FirebaseFirestore.Query = salesRef;
    if (salesRepId) {
      query = query.where('salesRepId', '==', salesRepId);
    }
    if (startDate) query = query.where('saleDate', '>=', startDate);
    if (endDate) query = query.where('saleDate', '<=', endDate);
    // The limit HAS to cut deterministically. Without an orderBy Firestore
    // returns maxFetch docs in DOCUMENT ID order and the createdAt sort below
    // runs after the cut, so once the company passes maxFetch sales an
    // arbitrary set of them stops existing for the board — and a sale lost that
    // way also leaves its carrier order unjoined, which the merged book renders
    // as a red "Never logged" row blaming a rep for a sale that IS in Firestore.
    // saleDate is the only field this may order by: it is the inequality field
    // above, and Firestore requires the inequality field to sort first.
    // Verified against production (2026-09-03): all 123 sales carry a Timestamp
    // saleDate and orderBy('saleDate') returns all 123, so ordering on it drops
    // nothing — a doc missing the orderBy field would be silently excluded.
    query = query.orderBy('saleDate', 'desc');
    const snapshot = await query.limit(maxFetch).get();
    // Truncation must be VISIBLE. A full page off the query means the cap was
    // reached and rows may have been cut, so the book on screen is short and the
    // UI has to say so rather than quietly showing fewer sales. A plain flag on
    // purpose: knowing HOW MANY were cut needs a second read, and a wrong count
    // is worse than no count.
    const truncated = snapshot.size === maxFetch;
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
        cancelledAt: data.cancelledAt?.toDate(),
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

    // `truncated` says the QUERY hit its cap — that is the silent one the UI must
    // surface. `sales.length === limit` is the ordinary page-size cut and is not
    // reported as truncation. Always present, false on the normal path.
    return NextResponse.json({ sales, truncated });
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

    // Install date is required on the form but optional server-side for
    // backward compatibility with older clients — stored null when omitted.
    // Resolved before the sale date because it can stand in for a missing one.
    let resolvedInstallDate: Date | null = null;
    if (installDate !== undefined && installDate !== null && installDate !== '') {
      const parsed = parseInstallDateInput(installDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      resolvedInstallDate = parsed.date;
    }

    // Sale date is user-editable but optional for backward compatibility with
    // older clients — fall back when omitted, reject when malformed.
    let resolvedSaleDate = new Date();
    if (saleDate !== undefined && saleDate !== null && saleDate !== '') {
      const parsed = parseSaleDateInput(saleDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      resolvedSaleDate = parsed.date;

      // An install can never happen before the sale it came from, so this
      // pairing is physically impossible — reject it rather than store a row
      // that dates the sale into a month it could not have happened in.
      if (
        resolvedInstallDate &&
        startOfDayMs(resolvedSaleDate) > startOfDayMs(resolvedInstallDate)
      ) {
        return NextResponse.json(
          { error: 'Sale date cannot be after the install date' },
          { status: 400 }
        );
      }
    } else if (resolvedInstallDate && startOfDayMs(resolvedInstallDate) < startOfDayMs(new Date())) {
      // No sale date sent (an older client, or a rep who left it alone) and the
      // install already happened on an earlier day: the sale is at least that
      // old, so date it to the install instead of to the upload. Only the past
      // direction is safe — a today/future install is the normal "sold now,
      // installs later" case and must stay dated now, or the sale would move
      // into a month it did not happen in.
      resolvedSaleDate = resolvedInstallDate;
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
      // Sale approval was removed in Sep 2026 — a logged sale is a sale, and the
      // install pipeline is the only lifecycle the portal tracks now. The field
      // survives because isPayableSale still reads it (a sale can be cancelled)
      // and because rows written before the change carry the old values.
      status: 'approved' as SaleStatus,
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

    await createNotification(
      salesRepId,
      'sale_submitted',
      'Sale logged',
      'Your sale is on the board. Pay follows about two weeks after the install.',
      `/portal/sales/${docRef.id}`
    );

    // Admins and owners used to be notified that a sale needed approval. With
    // approval gone there is no decision waiting on them, so the fan-out is too:
    // a new sale is not an interruption, it shows up on the board on its own.
    try {
      const ownerIds = (
        await adminDb
          .collection('users')
          .where('role', 'in', [...ADMIN_LEVEL_PLATFORM_ROLES])
          .get()
      ).docs.map((d) => d.id).filter((id) => id !== salesRepId);

      // after() keeps the sends alive past the response without a detached
      // promise the freeze would kill.
      if (ownerIds.length > 0) {
        after(async () => {
          await Promise.all(
            ownerIds.map((uid) =>
              sendPushToUser(uid, {
                title: 'New sale logged',
                body: `${salesRepName || 'A team member'} — ${customerName || 'new sale'}`,
                url: `/portal/sales/${docRef.id}`,
              })
            )
          );
        });
      }
    } catch (error) {
      console.error('Error notifying owners of new sale:', error);
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
