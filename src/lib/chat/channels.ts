import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { CHAT_CHANNELS, canAccessChatChannel, ChatChannel, ChatChannelAudience } from '@/types';
import { resolveRoles, PlatformRole, FieldRole } from '@/types';

export interface ChatChannelMembership {
  channelIds: string[];
  channels: ChatChannel[];
}

const CHAT_CHANNEL_AUDIENCES: ChatChannelAudience[] = ['all', 'field', 'managers', 'platform'];

export function isChatChannelAudience(value: unknown): value is ChatChannelAudience {
  return typeof value === 'string' && CHAT_CHANNEL_AUDIENCES.includes(value as ChatChannelAudience);
}

export function createChannelId(name: string, existingIds: Iterable<string> = []): string {
  const existing = new Set(existingIds);
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'channel';

  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function getChatChannelMembershipForUser(
  role?: PlatformRole,
  fieldRole?: FieldRole
): ChatChannelMembership {
  const channels = CHAT_CHANNELS.filter((channel) =>
    canAccessChatChannel(channel, role, fieldRole)
  ).sort((a, b) => a.order - b.order);

  return {
    channelIds: channels.map((channel) => channel.id),
    channels,
  };
}

export function toChatChannel(id: string, data: FirebaseFirestore.DocumentData): ChatChannel | null {
  if (!isChatChannelAudience(data.audience)) return null;

  return {
    id: typeof data.id === 'string' && data.id ? data.id : id,
    name: typeof data.name === 'string' ? data.name : id,
    description: typeof data.description === 'string' ? data.description : '',
    audience: data.audience,
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : 999,
    active: data.active !== false,
  };
}

export async function getMemberIdsForAudience(audience: ChatChannelAudience): Promise<string[]> {
  if (!adminDb) throw new Error('Database not configured');

  const usersSnap = await adminDb.collection('users').where('status', '==', 'active').get();
  const channel: ChatChannel = {
    id: 'membership-preview',
    name: 'Membership Preview',
    description: '',
    audience,
    order: 0,
    active: true,
  };

  return usersSnap.docs
    .map((doc) => {
      const data = doc.data();
      const { role, fieldRole } = resolveRoles(data.role, data.fieldRole);
      return { uid: doc.id, role, fieldRole };
    })
    .filter((user) => canAccessChatChannel(channel, user.role, user.fieldRole))
    .map((user) => user.uid);
}

export async function syncChatChannels(): Promise<{ channelsSynced: number }> {
  if (!adminDb) throw new Error('Database not configured');

  const channelsSnap = await adminDb.collection('chatChannels').get();
  const batch = adminDb.batch();
  let channelsSynced = 0;

  // Sync every Firestore channel, including archived ones. Archived channels remain
  // hidden by active:false, but keeping role-derived memberIds fresh makes reactivation immediate.
  for (const doc of channelsSnap.docs) {
    const channel = toChatChannel(doc.id, doc.data());
    if (!channel) continue;

    const memberIds = await getMemberIdsForAudience(channel.audience);
    batch.set(
      doc.ref,
      {
        id: channel.id,
        memberIds,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    channelsSynced += 1;
  }

  await batch.commit();
  return { channelsSynced };
}

export async function ensureChatChannelMember(channelId: string, uid: string): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');

  const channelRef = adminDb.collection('chatChannels').doc(channelId);
  const channelDoc = await channelRef.get();
  if (!channelDoc.exists) return;

  const memberIds = channelDoc.data()?.memberIds;
  if (Array.isArray(memberIds) && memberIds.includes(uid)) return;

  await channelRef.set(
    {
      memberIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
