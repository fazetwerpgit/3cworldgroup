import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { DOCUMENTS } from '@/lib/esign/documents';
import type { EsignDocKey } from '@/lib/esign/types';

/**
 * The blank source document for its signer to read before signing. Never the
 * stamped copy: that one is served to management by
 * /api/portal/onboarding/signed-pdf. Returns null for an unknown document.
 */
export async function sourcePdfResponse(docKey: EsignDocKey): Promise<NextResponse | null> {
  const config = DOCUMENTS[docKey];
  if (!config) return null;
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
