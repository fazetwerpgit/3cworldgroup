import type { Firestore } from 'firebase-admin/firestore';

// The app icon badge a native push carries: the recipient's unread chat
// channels, counted the way the portal's unread dot counts them
// (hooks/chat/useChatUnread): a channel is unread when its lastMessageAt is
// newer than the recipient's users/{uid}/chatReads/{channelId}.lastReadAt, or
// it has a last message and no receipt. The web reports the same number to the
// shell (shellExtras.sendNativeBadge), so the badge agrees in both directions.
//
// Cost: two small reads per native recipient (their channels, their receipts),
// each capped at MAX_BADGE_CHANNELS docs and narrowed to one field. Run only
// for users with a native token; web pushes never pay for it.

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
    const [channels, reads] = await Promise.all([
      db
        .collection('chatChannels')
        .where('memberIds', 'array-contains', uid)
        .where('active', '==', true)
        .select('id', 'lastMessageAt')
        .limit(MAX_BADGE_CHANNELS)
        .get(),
      db.collection('users').doc(uid).collection('chatReads').select('lastReadAt').limit(MAX_BADGE_CHANNELS).get(),
    ]);
    const readsByChannel = new Map<string, unknown>(reads.docs.map((d) => [d.id, d.get('lastReadAt')]));
    return countUnreadChannels(
      channels.docs.map((d) => ({ id: (d.get('id') as string | undefined) ?? d.id, lastMessageAt: d.get('lastMessageAt') })),
      readsByChannel
    );
  } catch (err) {
    console.error('Failed to count unread chat for badge', uid, err);
    return null;
  }
}
