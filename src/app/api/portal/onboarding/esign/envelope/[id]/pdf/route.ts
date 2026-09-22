import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { DOCUMENTS } from '@/lib/esign/documents';
import { loadEnvelope } from '@/lib/esign/inhouse';

// GET /api/portal/onboarding/esign/envelope/{id}/pdf — the blank source document
// for the envelope's owner to read before signing. Never the stamped copy: that
// one is served to management by /api/portal/onboarding/signed-pdf.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { id } = await ctx.params;
  const envelope = await loadEnvelope(id);
  if (!envelope) return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
  if (envelope.userId !== gate.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const config = DOCUMENTS[envelope.docKey];
  if (!config) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

  const pdf = await readFile(path.join(process.cwd(), 'assets', 'esign', config.file));
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${config.file}"`,
    },
  });
}
