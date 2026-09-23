// "New messages" pill math, shared by the phone and desktop threads. Only
// delivered messages count: unsent echoes (Sending… / Not sent) render after
// them at the tail, so tracking the raw tail would make every arrival that
// lands above a pending echo invisible to the counter.

interface ThreadItem {
  id: string;
  authorId: string;
  pendingState?: 'sending' | 'failed';
}

export function newestDeliveredId(messages: ThreadItem[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].pendingState) return messages[i].id;
  }
  return undefined;
}

/**
 * How many delivered messages from other people arrived after
 * `previousNewestId`. A loadOlder prepend leaves the newest delivered message
 * in place (0); a previous newest that is gone (deleted) also gives 0 rather
 * than a made-up count. The reader's own messages never count: their own send
 * already scrolls to the bottom.
 */
export function countNewArrivals(messages: ThreadItem[], previousNewestId: string | undefined, selfId?: string): number {
  if (!previousNewestId) return 0;
  const index = messages.findIndex((message) => message.id === previousNewestId);
  if (index === -1) return 0;
  let count = 0;
  for (let i = index + 1; i < messages.length; i++) {
    const message = messages[i];
    if (!message.pendingState && message.authorId !== selfId) count++;
  }
  return count;
}
