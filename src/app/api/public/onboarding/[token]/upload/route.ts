import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import {
  CANCELLED_INVITE_MESSAGE,
  CLOSED_INVITE_STATUSES,
  getInviteByToken,
  isInviteExpired,
  SUBMITTED_INVITE_STATUSES,
} from '@/lib/recruiting/inviteLookup';
import { validateUpload, buildFolderPath, replacedSlotFiles } from '@/lib/onboarding/uploads';
import { resolveUploadMime, sniffUploadMime } from '@/lib/forms/formUploads';

// POST /api/public/onboarding/[token]/upload - A candidate holding a valid
// invite token uploads a file for a storage-kind item before account creation.
// Files land under onboarding/invite_{inviteId}/{itemId}/. No Firestore/user
// writes happen here; the returned path is submitted later via [token] POST.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { token } = await params;
    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.data.status === 'cancelled') {
      return NextResponse.json({ error: CANCELLED_INVITE_MESSAGE }, { status: 410 });
    }
    if (isInviteExpired(invite.data.expiresAt) || invite.data.status === 'expired') {
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }
    // Same rule as the packet POST: a rejected invite takes no more files.
    if (CLOSED_INVITE_STATUSES.includes(invite.data.status)) {
      return NextResponse.json(
        { error: 'This onboarding link is closed. Contact your manager if you think this is a mistake.' },
        { status: 409 }
      );
    }
    if (SUBMITTED_INVITE_STATUSES.includes(invite.data.status)) {
      return NextResponse.json(
        { error: 'This onboarding packet was already submitted' },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const itemId = String(form.get('itemId') ?? '');
    const slot = form.get('slot') ? String(form.get('slot')) : null;
    const file = form.get('file');

    if (!itemId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing required fields: itemId, file' },
        { status: 400 }
      );
    }

    // iOS can send a HEIC with an empty type: judge it by its extension then.
    const mime = resolveUploadMime(file.type, file.name);
    const check = validateUpload({ itemId, slot, mime, size: file.size });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    // The declared type is only a hint: store what the bytes really are, and
    // refuse a file that is none of this item's accepted types.
    const buffer = Buffer.from(await file.arrayBuffer());
    const realMime = sniffUploadMime(buffer);
    const real = realMime ? validateUpload({ itemId, slot, mime: realMime, size: file.size }) : null;
    if (!realMime || !real?.ok) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const folder = buildFolderPath({ kind: 'invite', inviteId: invite.id }, itemId);
    const objectPath = `${folder}${real.fileBase}.${real.ext}`;

    const bucket = getOnboardingBucket();
    await bucket.file(objectPath).save(buffer, {
      contentType: realMime,
      resumable: false,
    });
    // A replaced photo with a different extension (png -> jpg) is removed.
    try {
      const [existing] = await bucket.getFiles({ prefix: folder });
      await Promise.all(
        replacedSlotFiles(existing.map((f) => f.name), folder, real.fileBase, real.ext).map((name) =>
          bucket.file(name).delete({ ignoreNotFound: true })
        )
      );
    } catch (error) {
      console.error('[onboarding-upload] could not remove the replaced file', error);
    }

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading public onboarding file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
