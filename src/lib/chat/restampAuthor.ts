import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { PlatformRole, FieldRole } from '@/types';

const BATCH_LIMIT = 400;
// Firestore 'in' queries accept at most 30 values per clause.
const IN_CHUNK_SIZE = 30;

export interface RestampFields {
  authorName?: string;
  authorRole?: PlatformRole | FieldRole | null;
}

// Re-stamps the denormalized authorName/authorRole on every chat message this
// user has ever sent (across every channel, via collectionGroup), plus the
// author name embedded in any reply-snippet that quotes one of those messages
// and in any channel's lastMessage preview they wrote (the channel list line).
// New messages already read authorName/authorRole fresh per request (see
// getVerifiedChatUser); this backfills the OLD ones so an admin name/role edit
// doesn't leave stale values in chat history forever.
export async function restampAuthor(uid: string, fields: RestampFields): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  if (fields.authorName === undefined && fields.authorRole === undefined) return;

  const authoredMessageIds: string[] = [];

  // startAfter needs the DocumentSnapshot, not the bare id string: a collection-
  // group document ID isn't a valid path on its own (it throws "odd number of
  // segments"), which would silently abort pagination past the first page.
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = adminDb
      .collectionGroup('messages')
      .where('authorId', '==', uid)
      .orderBy(FieldPath.documentId())
      .limit(BATCH_LIMIT);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    const batch = adminDb.batch();
    for (const doc of snap.docs) {
      authoredMessageIds.push(doc.id);
      const update: Record<string, unknown> = {};
      if (fields.authorName !== undefined) update.authorName = fields.authorName;
      if (fields.authorRole !== undefined) update.authorRole = fields.authorRole ?? FieldValue.delete();
      batch.update(doc.ref, update);
    }
    await batch.commit();

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_LIMIT) break;
  }

  // Reply snippets and lastMessage previews only carry the author's NAME (see
  // buildReplySnippet in api/portal/chat/messages/route.ts and lib/chat/
  // lastMessage.ts) — there's no role to re-stamp there.
  if (fields.authorName === undefined) return;

  await restampLastMessageAuthor(uid, fields.authorName);

  if (authoredMessageIds.length === 0) return;

  for (let i = 0; i < authoredMessageIds.length; i += IN_CHUNK_SIZE) {
    const chunk = authoredMessageIds.slice(i, i + IN_CHUNK_SIZE);
    let lastReplyDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = adminDb
        .collectionGroup('messages')
        .where('replyTo.messageId', 'in', chunk)
        .orderBy(FieldPath.documentId())
        .limit(BATCH_LIMIT);
      if (lastReplyDoc) query = query.startAfter(lastReplyDoc);

      const snap = await query.get();
      if (snap.empty) break;

      const batch = adminDb.batch();
      for (const doc of snap.docs) {
        batch.update(doc.ref, { 'replyTo.authorName': fields.authorName });
      }
      await batch.commit();

      lastReplyDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < BATCH_LIMIT) break;
    }
  }
}

// chatChannels/{id}.lastMessage.authorName for every channel whose preview line
// this user wrote. chatChannels is a top-level collection of a few dozen docs,
// so the automatic single-field index serves the query.
async function restampLastMessageAuthor(uid: string, authorName: string): Promise<void> {
  const db = adminDb!;
  const snap = await db.collection('chatChannels').where('lastMessage.authorId', '==', uid).get();
  if (snap.empty) return;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc.ref, { 'lastMessage.authorName': authorName });
    }
    await batch.commit();
  }
}

// Updates every doc a query returns, page by page (documentId order), with the
// same field update. Used for the self-delete scrub below.
async function updateAllMatching(
  query: FirebaseFirestore.Query,
  update: Record<string, unknown>
): Promise<number> {
  const db = adminDb!;
  let updated = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let page = query.orderBy(FieldPath.documentId()).limit(BATCH_LIMIT);
    if (lastDoc) page = page.startAfter(lastDoc);
    const snap = await page.get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) batch.update(doc.ref, update);
    await batch.commit();
    updated += snap.docs.length;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_LIMIT) break;
  }
  return updated;
}

/**
 * Self-delete: removes the person's name from the chat records restampAuthor
 * does not reach, setting it to `deletedName` ("Deleted user"):
 * - users/{other}/chatBlocks/{uid}.name, found by the blockedUid field
 *   (collection-group index: firestore.indexes.json fieldOverrides
 *   chatBlocks.blockedUid);
 * - chatReports where they were the reporter (reporterName) or the reported
 *   author (authorName). The report's messageText / attachment snapshot is
 *   KEPT as moderation evidence (listed in the privacy policy's "kept after
 *   deletion" section); only the name goes.
 * Each part is attempted even if another fails; the first error is rethrown
 * at the end so the caller can log it.
 */
export async function scrubDeletedChatAuthor(uid: string, deletedName: string): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  const db = adminDb;
  const results = await Promise.allSettled([
    updateAllMatching(db.collectionGroup('chatBlocks').where('blockedUid', '==', uid), { name: deletedName }),
    updateAllMatching(db.collection('chatReports').where('reporterUid', '==', uid), { reporterName: deletedName }),
    updateAllMatching(db.collection('chatReports').where('authorId', '==', uid), { authorName: deletedName }),
  ]);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;
}
