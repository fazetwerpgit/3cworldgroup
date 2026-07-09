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
// author name embedded in any reply-snippet that quotes one of those messages.
// New messages already read authorName/authorRole fresh per request (see
// getVerifiedChatUser); this backfills the OLD ones so an admin name/role edit
// doesn't leave stale values in chat history forever.
export async function restampAuthor(uid: string, fields: RestampFields): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  if (fields.authorName === undefined && fields.authorRole === undefined) return;

  const authoredMessageIds: string[] = [];

  let lastId: string | undefined;
  for (;;) {
    let query = adminDb
      .collectionGroup('messages')
      .where('authorId', '==', uid)
      .orderBy(FieldPath.documentId())
      .limit(BATCH_LIMIT);
    if (lastId) query = query.startAfter(lastId);

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

    lastId = snap.docs[snap.docs.length - 1].id;
    if (snap.docs.length < BATCH_LIMIT) break;
  }

  // Reply snippets only carry the author's NAME (see buildReplySnippet in
  // api/portal/chat/messages/route.ts) — there's no role to re-stamp there.
  if (fields.authorName === undefined || authoredMessageIds.length === 0) return;

  for (let i = 0; i < authoredMessageIds.length; i += IN_CHUNK_SIZE) {
    const chunk = authoredMessageIds.slice(i, i + IN_CHUNK_SIZE);
    let lastReplyId: string | undefined;
    for (;;) {
      let query = adminDb
        .collectionGroup('messages')
        .where('replyTo.messageId', 'in', chunk)
        .orderBy(FieldPath.documentId())
        .limit(BATCH_LIMIT);
      if (lastReplyId) query = query.startAfter(lastReplyId);

      const snap = await query.get();
      if (snap.empty) break;

      const batch = adminDb.batch();
      for (const doc of snap.docs) {
        batch.update(doc.ref, { 'replyTo.authorName': fields.authorName });
      }
      await batch.commit();

      lastReplyId = snap.docs[snap.docs.length - 1].id;
      if (snap.docs.length < BATCH_LIMIT) break;
    }
  }
}
