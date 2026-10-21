import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import {
  CAMPAIGNS_COLLECTION,
  MAX_CSV_BYTES,
  MAX_LEAD_ROWS,
  leadImportLive,
} from '@/lib/knock/leadImportServer';
import { withoutHiddenUserDocs } from '@/lib/users/demoAccount';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

// GET /api/portal/knock/leads - what the owner's Lead lists page needs before a file is chosen:
// the 3C Doors campaigns, the active people doors can go to, whether imports are switched on
// (KNOCK_LEAD_IMPORT_LIVE) and the file limits. OWNER ONLY. Demo and test accounts are never
// offered (lib/users/demoAccount).
export async function GET(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500, headers: NO_STORE });

  try {
    const [campaignSnap, userSnap] = await Promise.all([
      adminDb.collection(CAMPAIGNS_COLLECTION).get(),
      adminDb.collection('users').where('status', '==', 'active').get(),
    ]);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const campaigns = campaignSnap.docs
      .map((doc) => ({ id: doc.id, name: String(doc.data().name || doc.id), type: String(doc.data().type ?? '') }))
      .sort(byName);
    const people = withoutHiddenUserDocs(userSnap.docs)
      .map((doc) => ({ uid: doc.id, name: String(doc.data().displayName || doc.data().email || doc.id) }))
      .sort(byName);
    return NextResponse.json(
      { campaigns, people, live: leadImportLive(), maxBytes: MAX_CSV_BYTES, maxRows: MAX_LEAD_ROWS },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('Lead lists: loading campaigns failed:', error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500, headers: NO_STORE });
  }
}
