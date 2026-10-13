import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { loadOwnerSearchStats } from '@/lib/search/ownerSearchStats';

export const dynamic = 'force-dynamic';

// GET /api/portal/owner/search-stats — the owner's "Hiring from search" card.
// OWNER ONLY, like /api/portal/owner/summary: admin, operations and field
// callers get 403. config/searchStats (Search Console, refreshed daily by
// /api/cron/search-stats) plus public applications by channel for the last 7
// and 30 days. Counts only; never an applicant's details. Not a view-as
// endpoint: the header is never added to it, and src/proxy.ts refuses writes
// carrying it anyway.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  if (!gate.isOwner) {
    return NextResponse.json({ error: 'Forbidden: owner access required' }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const data = await loadOwnerSearchStats(adminDb);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Owner search stats failed:', error);
    return NextResponse.json({ error: 'Failed to load search stats' }, { status: 500 });
  }
}
