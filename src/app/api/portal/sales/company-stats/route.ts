import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { periodBounds } from '@/lib/leaderboard/periods';
import { summarizeCompanySales, type CompanyTapeStats, type TapeSale } from '@/lib/sales/companyTape';

// Names, counts and times only: the tape never renders a per-sale or per-rep
// amount, so an individual rep's sale value has no reason to leave this endpoint.
const EMPTY_STATS: CompanyTapeStats = { mtdCount: 0, mtdMonthlyValue: 0, lastSale: null, topRep: null };

// Firestore hands back a Timestamp; a locally-written doc (or a test) can hold a
// plain Date or an ISO string. Anything else reads as "no date".
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

// GET /api/portal/sales/company-stats — any signed-in, active portal user.
// Powers the "company tape" ticker in the All Company chat channel. Team scale
// is small, so approved sales are pulled and reduced in memory rather than via
// a compound Firestore query. Never 500s on an empty/malformed collection —
// falls back to zeros/null so the caller can hide the tape rather than ever
// render a fabricated number.
export async function GET(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json(EMPTY_STATS);
  }

  const caller = await requireVerifiedUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  try {
    const snapshot = await adminDb.collection('sales').where('status', '==', 'approved').get();

    // "This month" is the Chicago calendar month, like the leaderboard.
    const monthStartMs = periodBounds('month')!.start.getTime();
    const sales: TapeSale[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Bucket on the day the sale HAPPENED, not the day it was uploaded or
      // approved: a rep back-entering last month's work must not inflate this
      // month's tape (or read as today's latest sale). approvedAt/createdAt
      // only cover docs with no saleDate.
      const effectiveDate =
        toDate(data.saleDate) ?? toDate(data.approvedAt) ?? toDate(data.createdAt);
      if (!effectiveDate) return;

      const repName =
        typeof data.salesRepName === 'string' && data.salesRepName ? data.salesRepName : 'Unknown';
      sales.push({
        repKey: typeof data.salesRepId === 'string' && data.salesRepId ? data.salesRepId : `name:${repName}`,
        repName,
        effectiveMs: effectiveDate.getTime(),
        monthlyValue:
          typeof data.totalValue === 'number' && Number.isFinite(data.totalValue) ? data.totalValue : 0,
      });
    });

    return NextResponse.json(summarizeCompanySales(sales, monthStartMs) satisfies CompanyTapeStats);
  } catch (error) {
    console.error('Error computing company sales stats:', error);
    return NextResponse.json(EMPTY_STATS);
  }
}
