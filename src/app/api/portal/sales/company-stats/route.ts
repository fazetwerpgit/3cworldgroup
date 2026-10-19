import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { type CompanyTapeStats } from '@/lib/sales/companyTape';
import { loadCompanyTape } from '@/lib/leaderboard/snapshotStore';

// Names, counts and times only: the tape never renders a per-sale or per-rep
// amount, so an individual rep's sale value has no reason to leave this endpoint.
const EMPTY_STATS: CompanyTapeStats = { mtdCount: 0, mtdMonthlyValue: 0, lastSale: null, topRep: null };

// GET /api/portal/sales/company-stats — any signed-in, active portal user.
// Powers the "company tape" ticker in the All Company chat channel. The tape is
// stored with the leaderboard snapshot (lib/leaderboard/snapshotStore), reduced
// from every approved sale by companyTapeFromDocs, so a chat open costs one doc
// read instead of a read of every approved sale. Never 500s on an
// empty/malformed collection — falls back to zeros/null so the caller can hide
// the tape rather than ever render a fabricated number.
export async function GET(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json(EMPTY_STATS);
  }

  const caller = await requireVerifiedUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  try {
    const stats = await loadCompanyTape(new Date(), caller.uid);
    return NextResponse.json(stats satisfies CompanyTapeStats);
  } catch (error) {
    console.error('Error computing company sales stats:', error);
    return NextResponse.json(EMPTY_STATS);
  }
}
