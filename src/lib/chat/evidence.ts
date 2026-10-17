import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { chatObjectPathFromUrl, chatObjectUrlBase, getChatStorageBucketName } from '@/lib/chat/media';

// What happens to a deleted chat message's upload (photo, or PDF and its
// preview), and to the moderation copy kept when someone reported it.
//
// The copy lives at moderation/chat-reports/... with NO download token, so no
// URL opens it; the admin queue (GET /api/portal/admin/chat-reports) mints a
// short-lived signed URL from the report's evidencePath each time it lists it.
//
// When the copy fails, the original is kept (the evidence must not be lost)
// but its download token is replaced, so the chat URL stops opening it, and a
// chatEvidencePending doc records it for the cron sweep
// (/api/cron/chat-evidence) to copy again and delete.

export const CHAT_EVIDENCE_PENDING = 'chatEvidencePending';

// The Storage objects behind a deleted message's photo, or its PDF and the
// PDF's first-page preview: chat/{channelId}/{name} parsed from each download
// URL. None for a GIF or a missing attachment, and never any URL outside this
// bucket + channel folder (those are never deleted).
export function deletableChatObjectPaths(attachment: unknown, channelId: string): string[] {
  if (!attachment || typeof attachment !== 'object') return [];
  const { type, url, previewUrl } = attachment as { type?: unknown; url?: unknown; previewUrl?: unknown };
  if (type !== 'image' && type !== 'file') return [];
  const bucketName = getChatStorageBucketName();
  if (!bucketName) return [];
  const urls = type === 'file' ? [url, previewUrl] : [url];
  const paths = urls
    .map((candidate) => chatObjectPathFromUrl(candidate, bucketName, channelId))
    .filter((path): path is string => !!path);
  return [...new Set(paths)];
}

// Where another message can point at a chat object: its attachment url, or a
// PDF's preview url.
const CHAT_OBJECT_URL_FIELDS = ['attachment.url', 'attachment.previewUrl'] as const;

// The error code of a failed Storage/Firestore call, for logs that must never
// carry the object's download URL or token.
export function storageErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code === undefined ? 'unknown' : String(code);
}

// Whether a standing message in the channel other than messageId still points
// at the object (the send path accepts any URL in the channel's folder, so one
// could). Throws when the lookup fails.
async function chatObjectStillUsed(channelId: string, messageId: string, objectPath: string): Promise<boolean> {
  const bucketName = getChatStorageBucketName();
  if (!bucketName) return false;
  const urlBase = chatObjectUrlBase(bucketName, objectPath);
  const messages = adminDb!.collection('chatChannels').doc(channelId).collection('messages');
  const sharing = await Promise.all(
    CHAT_OBJECT_URL_FIELDS.map((field) => messages.where(field, '>=', urlBase).where(field, '<', `${urlBase}`).get())
  );
  return sharing.some((snapshot) =>
    snapshot.docs.some((doc) => {
      if (doc.id === messageId) return false;
      const data = doc.data();
      if (data.deletedAt) return false;
      return deletableChatObjectPaths(data.attachment, channelId).includes(objectPath);
    })
  );
}

// Deletes the upload of a just-deleted message from Storage, unless another
// standing message in the channel still points at the same object. A missing
// object counts as deleted. Never throws: the message is already scrubbed, so a
// Storage failure is logged (ids and error code only) and the delete still
// succeeds.
export async function deleteChatObject(channelId: string, messageId: string, objectPath: string): Promise<void> {
  try {
    if (!getChatStorageBucketName()) return;
    if (await chatObjectStillUsed(channelId, messageId, objectPath)) {
      console.warn(`Chat photo kept: another message still shows it (channel ${channelId}, message ${messageId})`);
      return;
    }
    await getOnboardingBucket().file(objectPath).delete({ ignoreNotFound: true });
  } catch (error) {
    if (storageErrorCode(error) === '404') return;
    console.error(`Error deleting chat photo (channel ${channelId}, message ${messageId}): code ${storageErrorCode(error)}`);
  }
}

// Where a reported message's upload is kept once the message is deleted.
// Admin SDK only: storage.rules deny every client read and write outside
// training/, and the copy carries no download token.
export function chatEvidencePath(channelId: string, messageId: string, objectPath: string): string {
  const name = objectPath.slice(objectPath.lastIndexOf('/') + 1);
  return `moderation/chat-reports/${channelId}/${messageId}/${name}`;
}

// Copies the upload to the moderation folder and removes the download token
// the copy inherits, so no URL opens it. A copy whose token cannot be removed
// is deleted again and the error rethrown.
async function copyToEvidence(objectPath: string, evidencePath: string): Promise<void> {
  const bucket = getOnboardingBucket();
  const evidence = bucket.file(evidencePath);
  await bucket.file(objectPath).copy(evidence);
  try {
    // A null custom-metadata value removes the key.
    await evidence.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
  } catch (tokenError) {
    await evidence.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw tokenError;
  }
}

type ReportDoc = FirebaseFirestore.QueryDocumentSnapshot;

async function reportsOnMessage(channelId: string, messageId: string): Promise<ReportDoc[]> {
  return (await adminDb!.collection('chatReports').where('messageId', '==', messageId).get()).docs.filter(
    (doc) => doc.data().channelId === channelId
  );
}

// Copies the upload and points every report at the copy (evidencePath only).
async function saveEvidence(channelId: string, messageId: string, objectPath: string, reports: ReportDoc[]) {
  const evidencePath = chatEvidencePath(channelId, messageId, objectPath);
  await copyToEvidence(objectPath, evidencePath);
  const batch = adminDb!.batch();
  for (const doc of reports) {
    batch.update(doc.ref, { evidencePath, evidenceSavedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}

// The reported upload of a message: the attachment's own object (never a PDF's
// preview), when it is one of ours.
function reportedObjectPath(attachment: unknown, channelId: string): string | null {
  const bucketName = getChatStorageBucketName();
  const url = attachment && typeof attachment === 'object' ? (attachment as { url?: unknown }).url : undefined;
  const objectPath = bucketName ? chatObjectPathFromUrl(url, bucketName, channelId) : null;
  if (!objectPath || !deletableChatObjectPaths(attachment, channelId).includes(objectPath)) return null;
  return objectPath;
}

// The evidence copy failed: the objects stay, but each gets a new download
// token so the deleted message's URLs stop opening them (skipped for an object
// another standing message still shows), and a chatEvidencePending doc lets
// the sweep try the copy again. Never throws.
async function holdReportedUpload(
  channelId: string,
  messageId: string,
  objectPath: string,
  deletePaths: string[],
  reportId: string | null
): Promise<void> {
  const bucket = getOnboardingBucket();
  for (const path of deletePaths) {
    try {
      if (await chatObjectStillUsed(channelId, messageId, path)) continue;
      await bucket.file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: randomUUID() } });
    } catch (error) {
      console.error(
        `Chat upload token not rotated (channel ${channelId}, message ${messageId}): code ${storageErrorCode(error)}`
      );
    }
  }
  try {
    await adminDb!
      .collection(CHAT_EVIDENCE_PENDING)
      .doc(`${channelId}_${messageId}`)
      .set({
        path: objectPath,
        reportId,
        createdAt: FieldValue.serverTimestamp(),
        channelId,
        messageId,
        deletePaths,
      });
  } catch (error) {
    console.error(
      `Chat evidence retry not recorded (channel ${channelId}, message ${messageId}): code ${storageErrorCode(error)}`
    );
  }
}

// Before a reported message's upload is deleted, copies it to the moderation
// folder and points every report on the message at the copy (evidencePath), so
// removing the message never destroys what was reported. Answers whether the
// chat objects may now be deleted: true when the message has no reports or no
// upload of ours, or the evidence is saved; false when any step failed, and the
// original then stays in place with a new token, queued for the sweep. Never
// throws.
export async function preserveReportedEvidence(
  channelId: string,
  messageId: string,
  attachment: unknown
): Promise<boolean> {
  if (!getChatStorageBucketName()) return true;
  const objectPath = reportedObjectPath(attachment, channelId);
  if (!objectPath) return true;
  let reportId: string | null = null;
  try {
    const reports = await reportsOnMessage(channelId, messageId);
    if (reports.length === 0) return true;
    reportId = reports[0].id;
    await saveEvidence(channelId, messageId, objectPath, reports);
    return true;
  } catch (error) {
    console.error(
      `Chat evidence not saved; upload kept (channel ${channelId}, message ${messageId}): code ${storageErrorCode(error)}`
    );
    await holdReportedUpload(channelId, messageId, objectPath, deletableChatObjectPaths(attachment, channelId), reportId);
    return false;
  }
}

const SWEEP_LIMIT = 50;

function safeSegment(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/');
}

// The cron sweep: for each chatEvidencePending doc, copies the upload again,
// points the reports at the copy, deletes the chat objects and drops the doc.
// A message with no reports left just has its objects deleted. A failed retry
// keeps the doc (attempts + last error code) for the next run.
export async function retryPendingChatEvidence(): Promise<{ checked: number; saved: number; failed: number }> {
  const snap = await adminDb!.collection(CHAT_EVIDENCE_PENDING).limit(SWEEP_LIMIT).get();
  let saved = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const { channelId, messageId, path } = data;
    const deletePaths: string[] = Array.isArray(data.deletePaths)
      ? data.deletePaths.filter((p: unknown): p is string => typeof p === 'string')
      : [];
    if (!safeSegment(channelId) || !safeSegment(messageId) || typeof path !== 'string' || !path.startsWith(`chat/${channelId}/`)) {
      await doc.ref.delete();
      continue;
    }
    try {
      const reports = await reportsOnMessage(channelId, messageId);
      if (reports.length > 0) await saveEvidence(channelId, messageId, path, reports);
      const toDelete = [...new Set([path, ...deletePaths])].filter((p) => p.startsWith(`chat/${channelId}/`));
      for (const objectPath of toDelete) await deleteChatObject(channelId, messageId, objectPath);
      await doc.ref.delete();
      saved += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `Chat evidence retry failed (channel ${channelId}, message ${messageId}): code ${storageErrorCode(error)}`
      );
      await doc.ref
        .set({ attempts: FieldValue.increment(1), lastErrorCode: storageErrorCode(error) }, { merge: true })
        .catch(() => undefined);
    }
  }
  return { checked: snap.docs.length, saved, failed };
}
