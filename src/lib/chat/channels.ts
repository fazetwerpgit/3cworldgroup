import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { CHAT_CHANNELS, canAccessChatChannel, ChatChannel } from '@/types';
import { resolveRoles, PlatformRole, FieldRole } from '@/types';

export interface ChatChannelMembership {
  channelIds: string[];
  channels: ChatChannel[];
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

export async function syncChatChannels(): Promise<{ channelsSynced: number }> {
  if (!adminDb) throw new Error('Database not configured');

  const usersSnap = await adminDb.collection('users').where('status', '==', 'active').get();
  const activeUsers = usersSnap.docs.map((doc) => {
    const data = doc.data();
    const { role, fieldRole } = resolveRoles(data.role, data.fieldRole);
    return { uid: doc.id, role, fieldRole };
  });

  const batch = adminDb.batch();

  for (const channel of CHAT_CHANNELS) {
    const memberIds = activeUsers
      .filter((user) => canAccessChatChannel(channel, user.role, user.fieldRole))
      .map((user) => user.uid);

    const ref = adminDb.collection('chatChannels').doc(channel.id);
    batch.set(
      ref,
      {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        audience: channel.audience,
        order: channel.order,
        active: channel.active,
        memberIds,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
  return { channelsSynced: CHAT_CHANNELS.length };
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
