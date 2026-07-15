import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function getBearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function verifyCaller(request: NextRequest): Promise<{ uid: string } | null> {
  if (!adminAuth) return null;
  const token = getBearerToken(request);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

interface CompanyStats {
  mtdCount: number;
  mtdMonthlyValue: number;
  // repName only — the tape never renders a per-sale amount, so an
  // individual rep's sale value has no reason to leave this endpoint.
  lastSale: { repName: string } | null;
}

const EMPTY_STATS: CompanyStats = { mtdCount: 0, mtdMonthlyValue: 0, lastSale: null };

// GET /api/portal/sales/company-stats — any signed-in portal user. Powers the
// "company tape" ticker in the All Company chat channel. Team scale is small,
// so approved sales are pulled and reduced in memory rather than via a
// compound Firestore query. Never 500s on an empty/malformed collection —
// falls back to zeros/null so the caller can hide the tape rather than ever
// render a fabricated number.
export async function GET(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json(EMPTY_STATS);
  }

  const caller = await verifyCaller(request);
  if (!caller) {
    return NextResponse.json({ error: 'Missing or invalid authentication token' }, { status: 401 });
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
      // Prefer the approval timestamp (when the sale actually hit the board);
      // fall back to createdAt for older docs that predate approvedAt.
      const approvedAt = data.approvedAt?.toDate ? data.approvedAt.toDate() : null;
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      const effectiveDate = approvedAt ?? createdAt;
      if (!effectiveDate) return;

      const effectiveMs = effectiveDate.getTime();
      const monthlyValue =
        typeof data.totalValue === 'number' && Number.isFinite(data.totalValue) ? data.totalValue : 0;

      if (effectiveMs >= monthStartMs) {
        mtdCount += 1;
        mtdMonthlyValue += monthlyValue;
      }

      // Most recent approved sale of all time, not just MTD.
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
