import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

// GET /api/portal/forms/attachment?path=form-attachments/... - management only.
// Mints a 15-min signed URL for the first file under the folder. Never exposes
// the raw path back as a usable storage URL.
export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const path = request.nextUrl.searchParams.get('path') ?? '';
    if (!path.startsWith('form-attachments/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const bucket = getOnboardingBucket();
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return NextResponse.json({ url: null });

    const [url] = await files[0].getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error signing form attachment:', error);
    return NextResponse.json({ error: 'Failed to load attachment' }, { status: 500 });
  }
}
