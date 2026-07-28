import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { validateUpload, buildFolderPath } from '@/lib/onboarding/uploads';

// POST /api/portal/onboarding/upload - An authenticated user uploads a file for
// a storage-kind onboarding item. Writes via the Admin SDK and returns the
// folder path to store as the item reference.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const userId = gate.uid;

    const form = await request.formData();
    const bodyUserId = form.get('userId');
    if (bodyUserId !== null && String(bodyUserId) !== userId) {
      return NextResponse.json({ error: 'userId does not match the verified user' }, { status: 400 });
    }
    const itemId = String(form.get('itemId') ?? '');
    const slot = form.get('slot') ? String(form.get('slot')) : null;
    const file = form.get('file');

    if (!itemId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing required fields: itemId, file' },
        { status: 400 }
      );
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
