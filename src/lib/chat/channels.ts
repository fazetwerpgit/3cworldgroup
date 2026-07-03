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

/** The manually-added members stored on a channel doc, cleaned to non-empty strings. */
export function readExtraMemberIds(data: FirebaseFirestore.DocumentData): string[] {
  return Array.isArray(data.extraMemberIds)
    ? data.extraMemberIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
    : [];
}

// Access gate that works on the RAW channel doc (not just the ChatChannel view) so it
// can honor manual additions: a uid in extraMemberIds gets in even when the role/audience
// check fails. Every chat route gates on this so added people see the channel and its
// messages/media. Falls back to the audience check for everyone else.
export function userCanAccessChannelDoc(
  data: FirebaseFirestore.DocumentData,
  identity: { uid: string; role?: PlatformRole; fieldRole?: FieldRole }
): boolean {
  const channel = toChatChannel(typeof data.id === 'string' ? data.id : '', data);
  // A malformed (unparseable) or archived (active:false) channel is off-limits to
  // EVERYONE — extras included. Only fall through to the manual-members check once the
  // channel parses and is active, so archiving a channel revokes extras too (matching the
  // pre-task behavior where an inactive channel 403'd even admins).
  if (!channel || !channel.active) return false;
  if (canAccessChatChannel(channel, identity.role, identity.fieldRole)) return true;
  return readExtraMemberIds(data).includes(identity.uid);
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
    const data = doc.data();
    const channel = toChatChannel(doc.id, data);
    if (!channel) continue;

    const audienceMemberIds = await getMemberIdsForAudience(channel.audience);

    // Manual additions must survive sync: keep extra members that still resolve to an
    // ACTIVE user doc so the memberIds-based Firestore realtime rules keep letting them in.
    // Deactivated extras are pruned from memberIds (they stay in extraMemberIds, so
    // reactivation restores realtime access on the next sync) — mirrors the audience filter.
    const extraMemberIds = readExtraMemberIds(data);
    let existingExtras: string[] = [];
    if (extraMemberIds.length > 0) {
      const refs = extraMemberIds.map((id) => adminDb!.collection('users').doc(id));
      const extraDocs = await adminDb.getAll(...refs);
      existingExtras = extraDocs
        .filter((d) => d.exists && d.data()?.status === 'active')
        .map((d) => d.id);
    }

    const memberIds = Array.from(new Set([...audienceMemberIds, ...existingExtras]));
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
