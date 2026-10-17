import { FieldPath, type Firestore } from 'firebase-admin/firestore';

// The app icon badge a native push carries: the recipient's unread chat
// channels, counted the way the portal's unread dot counts them
// (hooks/chat/useChatUnread): a channel is unread when its lastMessageAt is
// newer than the recipient's users/{uid}/chatReads/{channelId}.lastReadAt, or
// it has a last message and no receipt. The web reports the same number to the
// shell (shellExtras.sendNativeBadge), so the badge agrees in both directions.
//
// Cost per native recipient: one query for their member channels (document-id
// order, capped at MAX_BADGE_CHANNELS, narrowed to two fields), then one getAll
// for exactly those channels' receipts. Receipts are never listed, so a reader
// with receipts for many old channels can't push a member channel's receipt
// out of a capped page and overcount it. Run only for users with a native
// token; web pushes never pay for it.
//
// Every push to a native token carries this count, chat or not (an alert, an
// announcement): the badge is always the real unread chat number, so a non-chat
// push can also lower or clear a stale badge. That is intended.

/** Hard cap on docs read per query. A person sits in a handful of channels. */
export const MAX_BADGE_CHANNELS = 100;

function millisOf(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

/** Pure: unread channels given each channel's last message and the reader's receipts. */
export function countUnreadChannels(
  channels: Array<{ id: string; lastMessageAt: unknown }>,
  readsByChannel: Map<string, unknown>
): number {
  let count = 0;
  for (const channel of channels) {
    const last = millisOf(channel.lastMessageAt);
    if (last === null) continue;
    const read = millisOf(readsByChannel.get(channel.id));
    if (read === null || last > read) count += 1;
  }
  return count;
}

/**
 * The recipient's unread chat channel count, or null when it could not be read
 * (the caller then falls back to the old constant badge).
 */
export async function unreadChatBadge(db: Firestore, uid: string): Promise<number | null> {
  try {
    const channelsSnap = await db
      .collection('chatChannels')
      .where('memberIds', 'array-contains', uid)
      .where('active', '==', true)
      .orderBy(FieldPath.documentId())
      .select('id', 'lastMessageAt')
      .limit(MAX_BADGE_CHANNELS)
      .get();
    const channels = channelsSnap.docs.map((d) => ({
      id: (d.get('id') as string | undefined) || d.id,
      lastMessageAt: d.get('lastMessageAt'),
    }));
    if (channels.length === 0) return 0;
    const reads = db.collection('users').doc(uid).collection('chatReads');
    const receipts = await db.getAll(...channels.map((c) => reads.doc(c.id)), { fieldMask: ['lastReadAt'] });
    const readsByChannel = new Map<string, unknown>(
      receipts.filter((r) => r.exists).map((r) => [r.id, r.get('lastReadAt')])
    );
    return countUnreadChannels(channels, readsByChannel);
  } catch (err) {
    console.error('Failed to count unread chat for badge', uid, err);
    return null;
  }
}
