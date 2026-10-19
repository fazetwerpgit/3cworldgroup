import { isDemoSandboxChannel } from '@/lib/chat/channels';

// The App Review demo sandbox (a channel doc with demoSandbox: true) holds the
// demo accounts plus Jacob (lib/chat/sandboxStaff). Demo accounts read message
// docs straight from Firestore, so a real person's name must never be STORED on
// a sandbox message: whoever posts, a non-demo author is stamped with this
// stand-in instead (on the message, its reply quotes, the channel preview and
// the push). Demo accounts are fake people by design and keep their own names.

/** What a real (non-demo) author is called inside the demo sandbox. */
export const SANDBOX_STAFF_NAME = '3C Team';

/** The authorName to store for a message in this channel. */
export function storedAuthorName(
  channelData: FirebaseFirestore.DocumentData | null | undefined,
  author: { displayName: string; demoAccount?: boolean }
): string {
  if (isDemoSandboxChannel(channelData) && !author.demoAccount) return SANDBOX_STAFF_NAME;
  return author.displayName;
}
