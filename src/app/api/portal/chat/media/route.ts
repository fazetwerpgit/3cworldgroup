import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { getVerifiedChatUser, type ChatUser } from '@/lib/chat/access';
import { CHAT_TERMS_REFUSAL, needsChatTerms } from '@/lib/chat/terms';
import { toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import {
  MAX_UPLOAD_BYTES,
  buildTokenedDownloadUrl,
  chatObjectPath,
  PDF_MIME,
  getChatStorageBucketName,
  hasPdfMagic,
  isOwnChatPendingObject,
  parseChatPendingPath,
  sanitizeAttachmentFileName,
  uploadExtForMime,
} from '@/lib/chat/media';
import { userRateLimited } from '@/lib/userRateLimits';

// POST /api/portal/chat/media — verified caller who can access the channel adds
// an image or a PDF to chat storage, in one of two ways:
//
//   multipart (channelId, file): the bytes ride the request body. Vercel caps a
//     body near 4.5 MB, so clients use this for small files only.
//   JSON { channelId, pendingPath, name? }: the client already wrote the file to
//     chat-pending/{uid}/{id}.{ext} with the Firebase Storage SDK (storage.rules
//     limits that folder to its owner, 10 MB and image/PDF types). The route
//     checks the object (owner, size, type, PDF header) and moves it.
//
// Either way the file ends up at chat/{channelId}/{uuid}.{ext} with a download
// token, and the route returns the tokened URL.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;
    const limited = userRateLimited('chatUpload', user.uid);
    if (limited) return limited;

    // Same gate as a send: an app caller without the chat agreement on file
    // may not upload, so no attachment is stored for a message it can't post.
    if (needsChatTerms(user, request)) {
      return NextResponse.json(CHAT_TERMS_REFUSAL, { status: 403 });
    }

    const isJson = (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');
    return isJson ? await attachPending(request, user) : await uploadMultipart(request, user);
  } catch (error) {
    console.error('Error uploading chat media:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}

/** The channel exists and the caller may post to it; else the refusal response. */
async function checkChannel(channelId: string, user: ChatUser): Promise<NextResponse | null> {
  if (!adminDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const snap = await adminDb.collection('chatChannels').doc(channelId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
  }
  const data = snap.data() ?? {};
  if (!toChatChannel(snap.id, data)) {
    return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
  }
  if (!userCanAccessChannelDoc(data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole, demoAccount: user.demoAccount })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function tooLarge(isPdf: boolean): NextResponse {
  return NextResponse.json(
    { error: isPdf ? 'File too large — PDFs up to 10 MB.' : 'File exceeds the 10 MB limit' },
    { status: 400 }
  );
}

function uploadedResponse(url: string, contentType: string, name: string, size: number): NextResponse {
  return NextResponse.json(
    contentType === PDF_MIME ? { url, contentType, name, size } : { url, contentType }
  );
}

/** The object metadata every chat file is stored with: type, inline name, download token. */
function storedMetadata(contentType: string, name: string, token: string) {
  return {
    contentType,
    // Open PDFs in the browser's viewer under their original name.
    ...(contentType === PDF_MIME ? { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}` } : {}),
    // The download token that makes the ?token= URL readable while rules deny reads.
    metadata: { firebaseStorageDownloadTokens: token },
  };
}

async function uploadMultipart(request: NextRequest, user: ChatUser): Promise<NextResponse> {
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

  // Deny before reading the file bytes: channel must exist and be accessible.
  const refused = await checkChannel(channelId, user);
  if (refused) return refused;

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
  if (buffer.length > MAX_UPLOAD_BYTES) return tooLarge(isPdf);
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
  await getOnboardingBucket().file(objectPath).save(buffer, {
    resumable: false,
    metadata: storedMetadata(file.type, name, token),
  });

  return uploadedResponse(buildTokenedDownloadUrl(bucketName, objectPath, token), file.type, name, buffer.length);
}

/**
 * Best-effort removal of a refused upload. Callers pass only a path inside the
 * caller's own chat-pending folder. Without a bucket config nothing can be done.
 */
async function discardOwnPending(pendingPath: string): Promise<void> {
  if (!getChatStorageBucketName()) return;
  try {
    await getOnboardingBucket().file(pendingPath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.error('[chat/media] failed to remove a refused pending upload', pendingPath, error);
  }
}

async function attachPending(request: NextRequest, user: ChatUser): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const channelId = typeof body?.channelId === 'string' ? body.channelId : '';
  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }
  // Only the caller's own pending folder: never another user's upload.
  const pendingPath = body?.pendingPath;
  const pending = parseChatPendingPath(pendingPath, user.uid);
  if (!pending || typeof pendingPath !== 'string') {
    // A malformed name still inside the caller's own folder is theirs to lose.
    if (isOwnChatPendingObject(pendingPath, user.uid)) await discardOwnPending(pendingPath);
    return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 });
  }

  const refused = await checkChannel(channelId, user);
  if (refused) {
    // The upload can never be posted to this channel: drop it rather than
    // leave it for the cron sweep.
    if (refused.status === 403 || refused.status === 404) await discardOwnPending(pendingPath);
    return refused;
  }

  const bucketName = getChatStorageBucketName();
  if (!bucketName) {
    return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
  }
  const bucket = getOnboardingBucket();
  const source = bucket.file(pendingPath);
  const [exists] = await source.exists();
  if (!exists) {
    return NextResponse.json({ error: 'That upload was not found. Try sending it again.' }, { status: 404 });
  }

  // Drop a pending object the route refuses, so a bad upload leaves nothing behind.
  const discard = async (response: NextResponse) => {
    await source.delete({ ignoreNotFound: true }).catch((error: unknown) => {
      console.error('[chat/media] failed to remove a refused pending upload', pendingPath, error);
    });
    return response;
  };

  // storage.rules already enforce these; the route checks again rather than
  // trusting a rules deploy.
  const [metadata] = await source.getMetadata();
  const contentType = typeof metadata.contentType === 'string' ? metadata.contentType : '';
  const ext = uploadExtForMime(contentType);
  if (!ext || ext !== pending.ext) {
    return discard(NextResponse.json({ error: 'Unsupported file type' }, { status: 400 }));
  }
  const isPdf = contentType === PDF_MIME;
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0) {
    return discard(NextResponse.json({ error: 'File is empty' }, { status: 400 }));
  }
  if (size > MAX_UPLOAD_BYTES) return discard(tooLarge(isPdf));
  if (isPdf) {
    const [head] = await source.download({ start: 0, end: 4 });
    if (!hasPdfMagic(head)) {
      return discard(NextResponse.json({ error: 'That file is not a valid PDF.' }, { status: 400 }));
    }
  }
  // The shown name is client data: the same sanitizer and chat content filter
  // as the multipart path.
  const name = isPdf ? sanitizeAttachmentFileName(body?.name) : '';

  // Copy with explicit metadata (it replaces the uploader's, including any
  // download token Storage gave the client), then remove the pending object.
  const token = randomUUID();
  const objectPath = chatObjectPath(channelId, randomUUID(), ext);
  await source.copy(bucket.file(objectPath), storedMetadata(contentType, name, token));
  await source.delete({ ignoreNotFound: true }).catch((error: unknown) => {
    console.error('[chat/media] moved a pending upload but could not remove the original', pendingPath, error);
  });

  return uploadedResponse(buildTokenedDownloadUrl(bucketName, objectPath, token), contentType, name, size);
}
