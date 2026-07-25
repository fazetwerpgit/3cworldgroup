import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedSelfOrManagement } from '@/lib/auth/requireVerifiedAdmin';
import { validateUpload, buildFolderPath } from '@/lib/onboarding/uploads';

// POST /api/portal/onboarding/upload - Authenticated rep (or management acting
// on their behalf) uploads a file for a storage-kind onboarding item. Writes
// via the Admin SDK and returns the folder path to store as the item reference.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    // userId is the TARGET (whose folder), not the caller — it builds the
    // storage path below. The gate runs after the multipart read only because
    // the target lives in it; identity still comes solely from the
    // Authorization header, which is unaffected by the body encoding.
    const userId = String(form.get('userId') ?? '');
    const itemId = String(form.get('itemId') ?? '');
    const slot = form.get('slot') ? String(form.get('slot')) : null;
    const file = form.get('file');

    if (!userId || !itemId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, itemId, file' },
        { status: 400 }
      );
    }

    // A rep may upload into their own folder; management may upload on behalf.
    // allowOnboarding because a rep uploading their onboarding documents is BY
    // DEFINITION not yet active: the invite flow creates them status 'pending'
    // with a field role (api/public/onboarding/[token]/route.ts:227) and they
    // only flip to active once every item is approved
    // (lib/onboarding/activation.ts). It admits pending-WITH-a-field-role only:
    // an unapproved self-signup has no field role and is still rejected, as is
    // any deactivated account. Do not widen it to "allow pending" — that would
    // readmit bot signups.
    const gate = await requireVerifiedSelfOrManagement(request, userId, {
      allowOnboarding: true,
    });
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const check = validateUpload({ itemId, slot, mime: file.type, size: file.size });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const folder = buildFolderPath({ kind: 'user', userId }, itemId);
    const objectPath = `${folder}${check.fileBase}.${check.ext}`;

    const bucket = getOnboardingBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, {
      contentType: file.type,
      resumable: false,
    });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading onboarding file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
