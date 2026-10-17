import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { CHAT_TERMS_REFUSAL, needsChatTerms } from '@/lib/chat/terms';
import { toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import {
  MAX_UPLOAD_BYTES,
  buildTokenedDownloadUrl,
  chatObjectPath,
  PDF_MIME,
  getChatStorageBucketName,
  hasPdfMagic,
  sanitizeAttachmentFileName,
  uploadExtForMime,
} from '@/lib/chat/media';

// POST /api/portal/chat/media — verified caller who can access the channel uploads
// an image or a PDF (multipart: channelId, file). Writes to the admin storage bucket under
// chat/{channelId}/{uuid}.{ext} with a download token, returns the tokened URL.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    // Same gate as a send: an app caller without the chat agreement on file
    // may not upload, so no attachment is stored for a message it can't post.
    if (needsChatTerms(user, request)) {
      return NextResponse.json(CHAT_TERMS_REFUSAL, { status: 403 });
    }

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
    if (!userCanAccessChannelDoc(data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole, demoAccount: user.demoAccount })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extension is derived from the validated MIME type, never the client filename.
    // uploadExtForMime gates on own-property so prototype keys (__proto__, constructor)
    // can't slip past the allow-list.
    const ext = uploadExtForMime(file.type);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }
    const isPdf = file.type === PDF_MIME;

    // Enforce the size cap against the ACTUAL bytes, not any header.
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: isPdf ? 'File too large — PDFs up to 10 MB.' : 'File exceeds the 10 MB limit' },
        { status: 400 }
      );
    }
    // A PDF must actually be one: the declared MIME alone is client-controlled.
    if (isPdf && !hasPdfMagic(buffer)) {
      return NextResponse.json({ error: 'That file is not a valid PDF.' }, { status: 400 });
    }
    const name = isPdf ? sanitizeAttachmentFileName(file.name) : '';

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
        // Open PDFs in the browser's viewer under their original name.
        ...(isPdf ? { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}` } : {}),
        // The download token that makes the ?token= URL readable while rules deny-all.
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildTokenedDownloadUrl(bucketName, objectPath, token);
    return NextResponse.json(
      isPdf ? { url, contentType: file.type, name, size: buffer.length } : { url, contentType: file.type }
    );
  } catch (error) {
    console.error('Error uploading chat media:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
