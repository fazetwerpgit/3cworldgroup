import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

interface CompanyStats {
  mtdCount: number;
  mtdMonthlyValue: number;
  // repName only — the tape never renders a per-sale amount, so an
  // individual rep's sale value has no reason to leave this endpoint.
  lastSale: { repName: string } | null;
}

const EMPTY_STATS: CompanyStats = { mtdCount: 0, mtdMonthlyValue: 0, lastSale: null };

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

    const now = new Date();
    const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let mtdCount = 0;
    let mtdMonthlyValue = 0;
    let lastSale: CompanyStats['lastSale'] = null;
    let lastSaleMs = -Infinity;

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Bucket on the day the sale HAPPENED, not the day it was uploaded or
      // approved: a rep back-entering last month's work must not inflate this
      // month's tape. approvedAt/createdAt only cover docs with no saleDate.
      const effectiveDate =
        toDate(data.saleDate) ?? toDate(data.approvedAt) ?? toDate(data.createdAt);
      if (!effectiveDate) return;

      const effectiveMs = effectiveDate.getTime();
      const monthlyValue =
        typeof data.totalValue === 'number' && Number.isFinite(data.totalValue) ? data.totalValue : 0;

      if (effectiveMs >= monthStartMs) {
        mtdCount += 1;
        mtdMonthlyValue += monthlyValue;
      }

      // Most recent approved sale of all time, not just MTD — by sale date, so
      // a back-entered August sale never reads as today's latest sale.
      if (effectiveMs > lastSaleMs) {
        lastSaleMs = effectiveMs;
        const repName =
          typeof data.salesRepName === 'string' && data.salesRepName ? data.salesRepName : 'Unknown';
        lastSale = { repName };
      }
    });

    return NextResponse.json({ mtdCount, mtdMonthlyValue, lastSale } satisfies CompanyStats);
  } catch (error) {
    console.error('Error computing company sales stats:', error);
    return NextResponse.json(EMPTY_STATS);
  }
}
