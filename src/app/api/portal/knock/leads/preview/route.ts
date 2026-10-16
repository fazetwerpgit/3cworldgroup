import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import {
  leadImportLive,
  planLeadsOnServer,
  planSummary,
  readLeadImportInput,
} from '@/lib/knock/leadImportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Address-only rows are looked up with the Census geocoder (~11 s per 1,000 addresses, 4 at a time).
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

// POST /api/portal/knock/leads/preview - body { csvText, campaignId, assignTo? } (JSON, or
// gzipped JSON with Content-Type: application/gzip). OWNER ONLY. What uploading this lead file
// into the 3C Doors campaign would add: format, doors per pack, skipped rows and why, doors
// already there (checked against the campaign's houses on the server). Writes nothing, and runs
// even while KNOCK_LEAD_IMPORT_LIVE is off (`live` says whether Import would be allowed).
export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500, headers: NO_STORE });

  try {
    const read = await readLeadImportInput(request);
    if (!read.ok) return NextResponse.json({ error: read.error, code: read.code }, { status: read.status, headers: NO_STORE });
    const planned = await planLeadsOnServer(adminDb, read.input, { by: gate.uid });
    if (!planned.ok) {
      return NextResponse.json({ error: planned.error, code: planned.code }, { status: planned.status, headers: NO_STORE });
    }
    return NextResponse.json({ ...planSummary(planned), live: leadImportLive() }, { headers: NO_STORE });
  } catch (error) {
    console.error('Lead lists: preview failed:', error);
    return NextResponse.json({ error: 'Checking the file failed. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
