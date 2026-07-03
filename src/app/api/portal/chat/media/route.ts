import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import {
  MAX_UPLOAD_BYTES,
  buildTokenedDownloadUrl,
  chatObjectPath,
  getChatStorageBucketName,
  imageExtForMime,
} from '@/lib/chat/media';

// POST /api/portal/chat/media — verified caller who can access the channel uploads
// an image (multipart: channelId, file). Writes to the admin storage bucket under
// chat/{channelId}/{uuid}.{ext} with a download token, returns the tokened URL.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const form = await request.formData();
    const channelIdRaw = form.get('channelId');
    const channelId = typeof channelIdRaw === 'string' ? channelIdRaw : '';
    const file = form.get('file');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Deny before reading the file bytes: channel must exist and be accessible.
    const snap = await adminDb.collection('chatChannels').doc(channelId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    const data = snap.data() ?? {};
    const channel = toChatChannel(snap.id, data);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extension is derived from the validated MIME type, never the client filename.
    // imageExtForMime gates on own-property so prototype keys (__proto__, constructor)
    // can't slip past the allow-list.
    const ext = imageExtForMime(file.type);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    // Enforce the size cap against the ACTUAL bytes, not any header.
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 10 MB limit' }, { status: 400 });
    }

    const bucketName = getChatStorageBucketName();
    if (!bucketName) {
      return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
    }

    const token = randomUUID();
    const objectPath = chatObjectPath(channelId, randomUUID(), ext);
    const bucket = getOnboardingBucket();
    await bucket.file(objectPath).save(buffer, {
      resumable: false,
      metadata: {
        contentType: file.type,
        // The download token that makes the ?token= URL readable while rules deny-all.
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildTokenedDownloadUrl(bucketName, objectPath, token);
    return NextResponse.json({ url, contentType: file.type });
  } catch (error) {
    console.error('Error uploading chat media:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
