import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { logSensitiveFileAccess } from '@/lib/onboarding/sensitiveAccess';
import { signFolderFiles } from '@/lib/onboarding/signFiles';
import { UID_PATTERN } from '@/lib/onboarding/onboardingFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = 'private, no-store';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': NO_STORE } });
}

// GET /api/portal/admin/onboarding-file/[uid]/files?itemId= - OWNER ONLY. The
// uploads of one storage item (license photos, LLC papers, insurance) as
// 15-minute signed links. Every opening that returns files is logged in
// sensitiveAccessLog first, sensitive item or not; no audit row, no links.
export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);

  const { uid } = await params;
  const itemId = request.nextUrl.searchParams.get('itemId') ?? '';
  if (!UID_PATTERN.test(uid) || !isStorageItem(itemId)) return fail('Not found', 404);

  try {
    const snap = await adminDb.collection('userOnboarding').doc(`${uid}_${itemId}`).get();
    const reference = snap.exists ? (snap.data()?.reference as string | undefined) ?? null : null;
    const files = await signFolderFiles(reference);
    if (files.length > 0) {
      await logSensitiveFileAccess({
        targetUid: uid,
        itemId,
        revealedBy: gate.uid,
        revealedByName: gate.name,
        source: 'onboarding-file-files',
      });
    }
    return NextResponse.json({ files }, { headers: { 'Cache-Control': NO_STORE } });
  } catch (error) {
    console.error('Onboarding file uploads failed:', error instanceof Error ? error.message : 'unknown');
    return fail("Couldn't open the files. Try again.", 500);
  }
}
