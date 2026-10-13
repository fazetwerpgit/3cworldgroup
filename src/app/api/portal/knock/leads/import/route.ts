import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import {
  leadImportLive,
  planLeadsOnServer,
  planSummary,
  readLeadImportInput,
  writeLeadHouses,
  type LeadImportEvent,
  type LeadImportFailure,
  type ServerLeadPlan,
} from '@/lib/knock/leadImportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Same cap as the repo's other long routes; 20,000 doors are about 45 batched writes.
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

// POST /api/portal/knock/leads/import - same body as /preview. OWNER ONLY. Plans the file again
// here (a client plan is never trusted) and adds the new doors to `houses`, 450 per batched write,
// each with `create`, so a door that already exists is never overwritten (uploading the same file
// twice adds nothing the second time). Refused unless KNOCK_LEAD_IMPORT_LIVE=1 on the server.
//
// Errors before writing are JSON with a status. Once writing starts the answer is NDJSON
// (application/x-ndjson): `progress` lines after each batch, then one `done` or `error` line
// (see LeadImportEvent), so the page can draw a real progress bar.
export async function POST(request: NextRequest) {
  const gate = await requireOwner(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE });
  if (!leadImportLive()) {
    return NextResponse.json(
      { error: 'Adding doors from the portal is switched off for now. You can still check a file.', code: 'not-enabled' },
      { status: 403, headers: NO_STORE }
    );
  }
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500, headers: NO_STORE });
  const db = adminDb;

  let planned: ServerLeadPlan | LeadImportFailure;
  try {
    const read = await readLeadImportInput(request);
    if (!read.ok) return NextResponse.json({ error: read.error, code: read.code }, { status: read.status, headers: NO_STORE });
    planned = await planLeadsOnServer(db, read.input);
  } catch (error) {
    console.error('Lead lists: planning the import failed:', error);
    return NextResponse.json({ error: 'Checking the file failed. Try again.' }, { status: 500, headers: NO_STORE });
  }
  if (!planned.ok) {
    return NextResponse.json({ error: planned.error, code: planned.code }, { status: planned.status, headers: NO_STORE });
  }

  const { houses } = planned.plan;
  const summary = planSummary(planned);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: LeadImportEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let handled = 0;
      send({ type: 'progress', handled, total: houses.length });
      try {
        const result = await writeLeadHouses(db, houses, (done) => {
          handled = done;
          send({ type: 'progress', handled, total: houses.length });
        });
        // Counts only: never a customer's address in the logs.
        console.info(
          `Lead lists: ${gate.uid} added ${result.written} doors to campaign ${summary.campaign.id} ` +
            `(${result.alreadyThere} already there, ${summary.duplicates} duplicates, ${summary.rows} rows)`
        );
        send({ type: 'done', ...result, summary });
      } catch (error) {
        console.error('Lead lists: writing doors failed:', error);
        send({ type: 'error', error: 'Saving the doors stopped partway. Upload the same file again to add the rest.', handled });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...NO_STORE, 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}
