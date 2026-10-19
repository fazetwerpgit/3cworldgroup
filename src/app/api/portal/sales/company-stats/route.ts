import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import type { CompanyTapeStats } from '@/lib/sales/companyTape';
import { tapeForViewer } from '@/lib/sales/companyTapeStats';
import { loadCompanyTape } from '@/lib/leaderboard/snapshotStore';
import { createDemoRedactor } from '@/lib/demo/redact';

// Names, counts and times only: the tape never renders a per-sale or per-rep
// amount, so an individual rep's sale value has no reason to leave this endpoint.
const EMPTY_STATS: CompanyTapeStats = { mtdCount: 0, lastSale: null, topRep: null };

// GET /api/portal/sales/company-stats — any signed-in, active portal user.
// Powers the "company tape" ticker in the All Company chat channel. Counted
// exactly as the leaderboard counts (every sale, any status, joined to the
// carrier report like the Board; see lib/sales/companyTapeStats). The tape is
// kept with the leaderboard snapshot (lib/leaderboard/snapshotStore), built
// from the same sales and carrier join as the board, so a chat open costs one
// doc read instead of a read of every sale. Never 500s on an empty/malformed
// collection — falls back to zeros/null so the caller can hide the tape rather
// than ever render a fabricated number.
//
// The company-wide month-to-date dollar total (mtdMonthlyValue) is company
// financials: only an owner's response carries it.
export async function GET(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json(EMPTY_STATS);
  }

  const caller = await requireVerifiedUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  try {
    const tape = await loadCompanyTape(new Date(), caller.uid);
    // A demo account (App Review) never sees a real rep's name on the tape:
    // each name it prints is "Rep N" unless it is the caller's own.
    const redact = createDemoRedactor({ uid: caller.uid, demoAccount: caller.demoAccount === true });
    return NextResponse.json(tapeForViewer(tape, { isOwner: caller.isOwner === true, redact }));
  } catch (error) {
    console.error('Error computing company sales stats:', error);
    return NextResponse.json(EMPTY_STATS);
  }
}
