import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { ATTACHMENT_ROOT, isCleanAttachmentPath } from '@/lib/forms/attachmentPath';
import { MAX_FORM_FILE_BYTES } from '@/lib/forms/formUploads';
import { MAX_PROOF_SCREENSHOTS } from '@/lib/sales/proofPaths';
import { extractSaleFields, type ScanImage } from '@/lib/sales/scan/extract';
import { scanLimiter } from '@/lib/sales/scan/limiter';
import type { SaleScanResponse } from '@/lib/sales/scan/types';

// POST /api/portal/sales/scan { paths } - read the rep's own proof screenshots
// with Gemini and answer with Log Sale form values to prefill. The rep still
// checks every field and presses Submit; nothing is written here.
//
// Every failure after the auth and path checks answers 200 { fields: null,
// reason } so the form falls back to manual entry without an alarm. Logs carry
// counts and timings only: never image bytes or anything read off them.

export const runtime = 'nodejs';
// The model call is capped at 20 s; this leaves room for the storage reads.
export const maxDuration = 30;

// Gemini's inline request cap is 20 MB, base64 included.
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;
const READABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

const quiet = (reason: string) => NextResponse.json<SaleScanResponse>({ fields: null, reason });

function log(event: Record<string, string | number>) {
  console.info('[sale-scan]', JSON.stringify(event));
}

/** The first file in each proof folder (uploads write {folder}file.{ext}), within the size caps. */
async function readProofImages(paths: string[]): Promise<ScanImage[]> {
  const bucket = getOnboardingBucket();
  const images: ScanImage[] = [];
  let total = 0;
  for (const path of paths) {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const [files] = await bucket.getFiles({ prefix, delimiter: '/' });
    const file = files[0];
    if (!file) continue;
    const mimeType = String(file.metadata?.contentType ?? '');
    const size = Number(file.metadata?.size ?? 0);
    if (!READABLE_TYPES.has(mimeType) || size > MAX_FORM_FILE_BYTES || total + size > MAX_TOTAL_BYTES) continue;
    const [data] = await file.download();
    total += data.length;
    images.push({ data, mimeType });
  }
  return images;
}

export async function POST(request: NextRequest) {
  // Kill switch: off unless explicitly on, and then the route does not exist.
  if (process.env.SALE_SCAN_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Same gate as creating a sale: a verified, active user acting as themselves.
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = body?.paths;
  if (
    !Array.isArray(paths) ||
    paths.length < 1 ||
    paths.length > MAX_PROOF_SCREENSHOTS ||
    paths.some((p) => typeof p !== 'string')
  ) {
    return NextResponse.json({ error: `Send 1 to ${MAX_PROOF_SCREENSHOTS} proof paths` }, { status: 400 });
  }
  // Only the caller's own uploads, whatever their role: the uid comes from the token.
  const own = `${ATTACHMENT_ROOT}${gate.uid}/`;
  if (paths.some((p: string) => !isCleanAttachmentPath(p) || !p.startsWith(own))) {
    return NextResponse.json({ error: 'Forbidden: you can only scan your own uploads' }, { status: 403 });
  }

  if (!scanLimiter.take(gate.uid)) {
    log({ outcome: 'rate_limited' });
    return quiet('rate_limited');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log({ outcome: 'not_configured' });
    return quiet('not_configured');
  }

  const started = Date.now();
  let images: ScanImage[];
  try {
    images = await readProofImages([...new Set(paths as string[])]);
  } catch {
    log({ outcome: 'storage_error', ms: Date.now() - started });
    return quiet('storage_error');
  }
  if (images.length === 0) {
    log({ outcome: 'no_images', paths: paths.length });
    return quiet('no_images');
  }

  const read = Date.now();
  const result = await extractSaleFields(images, { apiKey });
  const timing = { images: images.length, readMs: read - started, modelMs: Date.now() - read };
  if (!result.ok) {
    log({ outcome: result.reason, ...timing });
    return quiet(result.reason);
  }
  const found = Object.keys(result.fields).length;
  log({ outcome: 'ok', found, ...timing });
  return NextResponse.json<SaleScanResponse>(found > 0 ? { fields: result.fields } : { fields: null, reason: 'nothing_found' });
}
