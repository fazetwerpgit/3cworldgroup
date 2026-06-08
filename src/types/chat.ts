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
