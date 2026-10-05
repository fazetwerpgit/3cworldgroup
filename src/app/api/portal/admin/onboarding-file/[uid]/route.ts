import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { writeAdminAudit } from '@/lib/audit/adminAudit';
import { buildOnboardingFileSummary, loadOnboardingFileSource, UID_PATTERN } from '@/lib/onboarding/onboardingFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = 'private, no-store';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': NO_STORE } });
}

// GET /api/portal/admin/onboarding-file/[uid] - OWNER ONLY. One person's
// onboarding file: profile, packet answers, and every onboarding item with its
// status and what can be opened. No file bytes and no decrypted SSN / DL# (the
// page uses the existing masked sensitive route for those). Each opening is
// recorded in adminAuditLog. Any owner may open any person's file, another
// owner's included, matching the sensitive reveal route's owner rule.
export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);

  const { uid } = await params;
  if (!UID_PATTERN.test(uid)) return fail('Not found', 404);

  try {
    const source = await loadOnboardingFileSource(adminDb, uid);
    if (!source) return fail('Not found', 404);
    const summary = buildOnboardingFileSummary(source);
    await writeAdminAudit({
      action: 'onboardingFile.view',
      actorUid: gate.uid,
      actorName: gate.name,
      targetUid: uid,
      targetName: summary.profile.name || undefined,
    });
    return NextResponse.json(summary, { headers: { 'Cache-Control': NO_STORE } });
  } catch (error) {
    console.error('Onboarding file failed:', error instanceof Error ? error.message : 'unknown');
    return fail("Couldn't load the onboarding file", 500);
  }
}
