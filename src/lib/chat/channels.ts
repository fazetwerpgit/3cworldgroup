import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  CHAT_CHANNELS,
  canAccessChatChannel,
  ChatChannel,
  ChatChannelAudience,
  roleRequiresOnboarding,
} from '@/types';
import { resolveRoles, PlatformRole, FieldRole } from '@/types';
import { isDemoAccount } from '@/lib/users/demoAccount';
import { emailFromUserDoc } from '@/lib/email/userEmail';
import { isSandboxStaff } from '@/lib/chat/sandboxStaff';

// APP REVIEW DEMO SANDBOX. A channel doc with `demoSandbox: true` is the one
// place a demo account (users/{uid}.demoAccount === true) may chat, so App
// Review can exercise send, report and block without ever seeing or reaching
// a real person. Its membership is fixed, not audience-based: demo accounts
// plus Jacob (owner, who runs App Review). Owner's call: no other real user
// sees it, admins and owners included, whatever their role, audience,
// extraMemberIds or a stale memberIds entry; a demo account stays out of every
// non-sandbox channel. Setup: docs/ios-app/APP-REVIEW-DEMO.md.

/** The channel doc field that marks the App Review demo sandbox. */
export const DEMO_SANDBOX_FIELD = 'demoSandbox';

export function isDemoSandboxChannel(data: FirebaseFirestore.DocumentData | null | undefined): boolean {
  return data?.[DEMO_SANDBOX_FIELD] === true;
}

export { SANDBOX_STAFF_UIDS, SANDBOX_STAFF_EMAILS, isSandboxStaff } from '@/lib/chat/sandboxStaff';

/**
 * Whether a users/{uid} doc belongs in a sandbox channel: an active demo
 * account, or Jacob. Nobody else, ever (other admins and owners included).
 */
export function isEligibleSandboxMember(data: FirebaseFirestore.DocumentData, uid?: string): boolean {
  if (data.status !== 'active') return false;
  if (isDemoAccount(data)) return true;
  return isSandboxStaff(uid, emailFromUserDoc({ get: (field) => data[field] }));
}

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
    ...(isDemoSandboxChannel(data) ? { demoSandbox: true } : {}),
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
// A demo account reaches ONLY a demo sandbox channel (see the top of this file):
// `demoAccount` is required so every caller has to carry the flag (a raw uid in
// extraMemberIds must not let one in anywhere else). A sandbox channel admits
// demo accounts and Jacob only (isSandboxStaff), never by role, audience,
// extraMemberIds or memberIds.
export function userCanAccessChannelDoc(
  data: FirebaseFirestore.DocumentData,
  identity: { uid: string; role?: PlatformRole; fieldRole?: FieldRole; demoAccount: boolean; email?: string | null }
): boolean {
  const sandbox = isDemoSandboxChannel(data);
  if (identity.demoAccount && !sandbox) return false;
  const channel = toChatChannel(typeof data.id === 'string' ? data.id : '', data);
  // A malformed (unparseable) or archived (active:false) channel is off-limits to
  // EVERYONE — extras included. Only fall through to the manual-members check once the
  // channel parses and is active, so archiving a channel revokes extras too (matching the
  // pre-task behavior where an inactive channel 403'd even admins).
  if (!channel || !channel.active) return false;
  if (sandbox) return identity.demoAccount || isSandboxStaff(identity.uid, identity.email);
  if (canAccessChatChannel(channel, identity.role, identity.fieldRole)) return true;
  return readExtraMemberIds(data).includes(identity.uid);
}

// Whether an account may be a chat member at all. Pass the channel doc when the
// question is about one channel: a demo sandbox takes demo accounts plus Jacob
// only (isEligibleSandboxMember, which needs the uid); every other channel never
// takes a demo account.
export function isEligibleChatMember(
  data: FirebaseFirestore.DocumentData,
  channelData?: FirebaseFirestore.DocumentData | null,
  uid?: string
): boolean {
  if (isDemoSandboxChannel(channelData)) return isEligibleSandboxMember(data, uid);
  if (isDemoAccount(data)) return false;
  const { fieldRole } = resolveRoles(data.role, data.fieldRole);
  return data.status === 'active' ||
    (data.status === 'pending' && roleRequiresOnboarding(fieldRole));
}

// Whether a user (raw users/{uid} doc) belongs in a channel's memberIds right now:
// an eligible account whose current role reaches the audience, or a manual extra.
// Archived channels are judged as if active (like syncChatChannels) so reactivating
// one restores access immediately.
export function belongsInChannelDoc(
  channelData: FirebaseFirestore.DocumentData,
  uid: string,
  userData: FirebaseFirestore.DocumentData
): boolean {
  if (!isEligibleChatMember(userData, channelData, uid)) return false;
  // Sandbox membership is the eligibility rule alone (no audience, no extras).
  if (isDemoSandboxChannel(channelData)) return !!toChatChannel(typeof channelData.id === 'string' ? channelData.id : '', channelData);
  const channel = toChatChannel(typeof channelData.id === 'string' ? channelData.id : '', channelData);
  if (!channel) return false;
  const { role, fieldRole } = resolveRoles(userData.role, userData.fieldRole);
  return (
    canAccessChatChannel({ ...channel, active: true }, role, fieldRole) ||
    readExtraMemberIds(channelData).includes(uid)
  );
}

interface ChatUserSnapshot {
  id: string;
  data(): FirebaseFirestore.DocumentData;
}

export async function getMemberIdsForAudience(
  audience: ChatChannelAudience,
  prefetchedUsers?: readonly ChatUserSnapshot[]
): Promise<string[]> {
  if (!adminDb) throw new Error('Database not configured');

  let users = prefetchedUsers;
  if (!users) {
    const [activeUsersSnap, pendingUsersSnap] = await Promise.all([
      adminDb.collection('users').where('status', '==', 'active').get(),
      adminDb.collection('users').where('status', '==', 'pending').get(),
    ]);
    users = [...activeUsersSnap.docs, ...pendingUsersSnap.docs];
  }
  const channel: ChatChannel = {
    id: 'membership-preview',
    name: 'Membership Preview',
    description: '',
    audience,
    order: 0,
    active: true,
  };

  return users
    .filter((doc) => isEligibleChatMember(doc.data()))
    .map((doc) => {
      const data = doc.data();
      const { role, fieldRole } = resolveRoles(data.role, data.fieldRole);
      return { uid: doc.id, role, fieldRole };
    })
    .filter((user) => canAccessChatChannel(channel, user.role, user.fieldRole))
    .map((user) => user.uid);
}

/** The memberIds a demo sandbox channel should hold, from the prefetched users. */
export function sandboxMemberIds(users: readonly ChatUserSnapshot[]): string[] {
  return users.filter((doc) => isEligibleSandboxMember(doc.data(), doc.id)).map((doc) => doc.id);
}

/** One channel's memberIds as a sync would leave them. */
export interface ChatChannelSyncItem {
  channelId: string;
  ref: FirebaseFirestore.DocumentReference;
  /** The App Review demo sandbox (fixed membership: demo accounts plus Jacob). */
  sandbox: boolean;
  /** memberIds on the doc now. */
  before: readonly string[];
  /** memberIds after the sync. */
  memberIds: string[];
}

/**
 * What syncChatChannels would write, read-only: every channel's current and
 * recomputed memberIds. scripts/sync-chat-channels.mjs prints this as a dry run.
 */
export async function planChatChannelSync(): Promise<ChatChannelSyncItem[]> {
  if (!adminDb) throw new Error('Database not configured');

  const channelsSnap = await adminDb.collection('chatChannels').get();
  const [activeUsersSnap, pendingUsersSnap] = await Promise.all([
    adminDb.collection('users').where('status', '==', 'active').get(),
    adminDb.collection('users').where('status', '==', 'pending').get(),
  ]);
  const users = [...activeUsersSnap.docs, ...pendingUsersSnap.docs];
  const plan: ChatChannelSyncItem[] = [];

  // Sync every Firestore channel, including archived ones. Archived channels remain
  // hidden by active:false, but keeping role-derived memberIds fresh makes reactivation immediate.
  for (const doc of channelsSnap.docs) {
    const data = doc.data();
    const channel = toChatChannel(doc.id, data);
    if (!channel) continue;
    const before = Array.isArray(data.memberIds)
      ? data.memberIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];

    // The demo sandbox: demo accounts plus Jacob, nothing else (anyone else in
    // its memberIds is dropped here).
    if (isDemoSandboxChannel(data)) {
      plan.push({ channelId: channel.id, ref: doc.ref, sandbox: true, before, memberIds: sandboxMemberIds(users) });
      continue;
    }

    const audienceMemberIds = await getMemberIdsForAudience(channel.audience, users);

    // Manual additions must survive sync: keep extra members that still resolve to an
    // eligible user doc so the memberIds-based Firestore realtime rules keep letting them in.
    // Deactivated and otherwise ineligible extras are pruned from memberIds (they stay in
    // extraMemberIds, so reactivation restores realtime access on the next sync).
    const extraMemberIds = readExtraMemberIds(data);
    let existingExtras: string[] = [];
    if (extraMemberIds.length > 0) {
      const refs = extraMemberIds.map((id) => adminDb!.collection('users').doc(id));
      const extraDocs = await adminDb.getAll(...refs);
      existingExtras = extraDocs
        .filter((d) => d.exists && isEligibleChatMember(d.data() ?? {}))
        .map((d) => d.id);
    }

    const memberIds = Array.from(new Set([...audienceMemberIds, ...existingExtras]));
    plan.push({ channelId: channel.id, ref: doc.ref, sandbox: false, before, memberIds });
  }

  return plan;
}

/** Writes a planned sync in one batch. */
export async function applyChatChannelSync(plan: readonly ChatChannelSyncItem[]): Promise<{ channelsSynced: number }> {
  if (!adminDb) throw new Error('Database not configured');
  const batch = adminDb.batch();
  for (const item of plan) {
    batch.set(
      item.ref,
      { id: item.channelId, memberIds: item.memberIds, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  await batch.commit();
  return { channelsSynced: plan.length };
}

export async function syncChatChannels(): Promise<{ channelsSynced: number }> {
  return applyChatChannelSync(await planChatChannelSync());
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

// memberIds drives the Firestore read rules and the chat push fan-out, so it must
// follow the user's CURRENT role and status. Recomputes one user's membership on
// every channel doc: adds them where they now qualify, removes them where they no
// longer do (extraMemberIds is never touched). Pass the user doc data when the
// caller already has it; otherwise it is read here (a missing doc removes them
// everywhere). Returns the active channels the user is now a member of.
export async function reconcileChatMembershipForUser(
  uid: string,
  userData?: FirebaseFirestore.DocumentData | null
): Promise<ChatChannel[]> {
  if (!adminDb) throw new Error('Database not configured');

  const data =
    userData === undefined
      ? (await adminDb.collection('users').doc(uid).get()).data() ?? {}
      : userData ?? {};
  const channelsSnap = await adminDb.collection('chatChannels').get();
  const batch = adminDb.batch();
  let writes = 0;
  const memberOf: ChatChannel[] = [];

  for (const doc of channelsSnap.docs) {
    const channelData = doc.data();
    const channel = toChatChannel(doc.id, channelData);
    if (!channel) continue;

    const belongs = belongsInChannelDoc({ ...channelData, id: channel.id }, uid, data);
    const isMember = Array.isArray(channelData.memberIds) && channelData.memberIds.includes(uid);
    if (belongs !== isMember) {
      batch.set(
        doc.ref,
        {
          memberIds: belongs ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      writes += 1;
    }
    if (belongs && channel.active) memberOf.push(channel);
  }

  if (writes > 0) await batch.commit();
  return memberOf.sort((a, b) => a.order - b.order);
}
