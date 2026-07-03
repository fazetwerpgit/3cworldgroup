import { PlatformRole, FieldRole } from './auth';

export type ChatChannelAudience = 'all' | 'field' | 'managers' | 'platform';

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  audience: ChatChannelAudience;
  order: number;
  active: boolean;
}

// A single media attachment on a message. `image` is a file the sender uploaded
// to our own storage bucket (url is a Firebase tokened download URL scoped to the
// channel's folder); `gif` is a Tenor-hosted GIF (url host is media.tenor.com).
export interface ChatAttachment {
  type: 'image' | 'gif';
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
}

// A server-resolved quote of the message being replied to. The snippet text is
// stamped from the SOURCE doc at send time (never trusted from the client) and
// capped at 140 chars, or 'Photo' / 'GIF' when the source was attachment-only.
export interface ChatReplySnippet {
  messageId: string;
  authorName: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole?: PlatformRole | FieldRole;
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  // Optional media. `hasAttachment` mirrors `attachment != null` so Firestore can
  // query media messages (where hasAttachment == true); both are absent on the
  // pre-media message docs, which must keep rendering exactly as before.
  attachment?: ChatAttachment;
  hasAttachment?: boolean;
  // Optional reply quote (server-stamped) and edit marker. Both absent on
  // untouched/legacy docs, which must render exactly as before.
  replyTo?: ChatReplySnippet;
  editedAt?: Date;
}

export const CHAT_CHANNELS: ChatChannel[] = [
  {
    id: 'all-company',
    name: 'All Company',
    description: 'Company-wide updates and quick coordination.',
    audience: 'all',
    order: 1,
    active: true,
  },
  {
    id: 'new-reps',
    name: 'New Reps',
    description: 'Onboarding help, first-week questions, and checklist guidance.',
    audience: 'field',
    order: 2,
    active: true,
  },
  {
    id: 'training-updates',
    name: 'Training Updates',
    description: 'Online training, call reminders, and field-readiness notes.',
    audience: 'all',
    order: 3,
    active: true,
  },
  {
    id: 'managers',
    name: 'Managers',
    description: 'Manager alignment, field-train requests, and rep support.',
    audience: 'managers',
    order: 4,
    active: true,
  },
];

export function getChatChannel(channelId: string): ChatChannel | undefined {
  return CHAT_CHANNELS.find((channel) => channel.id === channelId);
}

export function canAccessChatChannel(
  channel: ChatChannel,
  role?: PlatformRole,
  fieldRole?: FieldRole
): boolean {
  if (!channel.active) return false;
  if (role === 'admin' || role === 'operations') return true;
  if (channel.audience === 'all') return !!role || !!fieldRole;
  if (channel.audience === 'field') return !!fieldRole;
  if (channel.audience === 'managers') {
    return fieldRole === 'l1_manager' || fieldRole === 'l2_manager';
  }
  if (channel.audience === 'platform') return role === 'admin' || role === 'operations';
  return false;
}

export function getChatChannelsForUser(
  role?: PlatformRole,
  fieldRole?: FieldRole
): ChatChannel[] {
  return CHAT_CHANNELS.filter((channel) =>
    canAccessChatChannel(channel, role, fieldRole)
  ).sort((a, b) => a.order - b.order);
}
