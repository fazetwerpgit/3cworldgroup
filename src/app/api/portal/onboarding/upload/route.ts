import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import {
  requireVerifiedManagement,
  requireVerifiedUser,
} from '@/lib/auth/requireVerifiedAdmin';
import { validateUpload, buildFolderPath } from '@/lib/onboarding/uploads';

// POST /api/portal/onboarding/upload - Authenticated rep (or management acting
// on their behalf) uploads a file for a storage-kind onboarding item. Writes
// via the Admin SDK and returns the folder path to store as the item reference.
export async function POST(request: NextRequest) {
  try {
    // Authenticate from the Authorization header before parsing the multipart
    // body, so an unauthenticated caller cannot push a large file into memory
    // ahead of the size cap in validateUpload.
    //
    // The self path uses requireVerifiedUser with { allowOnboarding: true }
    // rather than requireVerifiedSelfOrManagement, which is active-only. A rep
    // uploading their onboarding documents is by definition not yet active:
    // the invite flow creates them status 'pending' with a field role
    // (api/public/onboarding/[token]/route.ts:227) and they only flip to active
    // once every item is approved (lib/onboarding/activation.ts). It admits
    // pending-with-a-field-role only — never an unapproved self-signup, never a
    // deactivated account.
    const self = await requireVerifiedUser(request, { allowOnboarding: true });
    if (!self.ok) {
      return NextResponse.json({ error: self.error }, { status: self.status });
    }

    const form = await request.formData();
    // userId is the TARGET (whose folder), not the caller — it builds the
    // storage path below.
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

    // Uploading into someone else's folder is management-only.
    if (self.uid !== userId) {
      const management = await requireVerifiedManagement(request);
      if (!management.ok) {
        return NextResponse.json(
          { error: management.error },
          { status: management.status }
        );
      }
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
