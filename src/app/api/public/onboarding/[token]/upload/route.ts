import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { hashInviteToken } from '@/lib/recruiting/tokens';
import { validateUpload, buildFolderPath } from '@/lib/onboarding/uploads';

const LOCKED_STATUSES = ['submitted', 'approved', 'converted'];

async function getInviteByToken(token: string) {
  if (!adminDb) return null;
  const tokenHash = hashInviteToken(token);
  const snapshot = await adminDb
    .collection('onboardingInvites')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() };
}

function isExpired(expiresAt: FirebaseFirestore.Timestamp | undefined) {
  return !!expiresAt?.toDate && expiresAt.toDate().getTime() < Date.now();
}

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
    if (isExpired(invite.data.expiresAt) || invite.data.status === 'expired') {
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }
    if (LOCKED_STATUSES.includes(invite.data.status)) {
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

    const check = validateUpload({ itemId, slot, mime: file.type, size: file.size });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const folder = buildFolderPath({ kind: 'invite', inviteId: invite.id }, itemId);
    const objectPath = `${folder}${check.fileBase}.${check.ext}`;

    const bucket = getOnboardingBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, {
      contentType: file.type,
      resumable: false,
    });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading public onboarding file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
