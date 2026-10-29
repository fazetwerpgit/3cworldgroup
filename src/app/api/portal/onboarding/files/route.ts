import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types';
import { requireVerifiedRecruiting } from '@/lib/auth/requireVerifiedAdmin';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { canOpenOnboardingItem, isOwnerOnlyOnboardingItem, logSensitiveFileAccess } from '@/lib/onboarding/sensitiveAccess';
import { signFolderFiles } from '@/lib/onboarding/signFiles';

// GET /api/portal/onboarding/files?userId=&itemId= - the uploaded files of one
// onboarding item (driver's-license photos, ...) after it has been reviewed.
// The review queue only signs files while an item is waiting; this opens them
// later, on demand. Management only; a sensitive item's files are admin/owner
// only (tax and banking items owner only) and every opening is audited in sensitiveAccessLog (fail closed).
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedRecruiting(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const userId = request.nextUrl.searchParams.get('userId') ?? '';
  const itemId = request.nextUrl.searchParams.get('itemId') ?? '';
  const item = ONBOARDING_ITEMS.find((candidate) => candidate.id === itemId);
  if (!/^[A-Za-z0-9]{1,128}$/.test(userId) || !item || !isStorageItem(item.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!canOpenOnboardingItem(item.id, gate)) {
    const error = isOwnerOnlyOnboardingItem(item.id)
      ? 'Only an owner can open these files'
      : 'Only admins can open these files';
    return NextResponse.json({ error }, { status: 403 });
  }

  const doc = await adminDb.collection('userOnboarding').doc(`${userId}_${item.id}`).get();
  const reference = doc.exists ? (doc.data()?.reference as string | undefined) ?? null : null;
  const files = await signFolderFiles(reference);
  if (item.sensitive && files.length > 0) {
    try {
      await logSensitiveFileAccess({
        targetUid: userId,
        itemId: item.id,
        revealedBy: gate.uid,
        revealedByName: gate.name,
        source: 'onboarding-files',
      });
    } catch (error) {
      console.error('Failed to audit sensitive onboarding file access:', error);
      return NextResponse.json({ error: "Couldn't open the files. Try again." }, { status: 500 });
    }
  }
  return NextResponse.json({ files });
}
