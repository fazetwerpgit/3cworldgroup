import { describe, expect, it } from 'vitest';
import type { ChatChannelDoc } from '@/hooks/chat/useChatChannels';
import { formatUnreadCount, UNREAD_COUNT_CAP } from '@/hooks/chat/useChatUnreadCounts';
import { channelPreview } from './MobileChannelList';

const base = { id: 'general', name: 'General', description: 'Everyone at 3C' } as ChatChannelDoc;
const last = { messageId: 'm1', authorId: 'ana', authorName: 'Ana Lopez', text: 'Door knocking at 4' };

describe('channelPreview', () => {
  it('falls back to the description with no preview', () => {
    expect(channelPreview(base)).toEqual({ who: null, text: 'Everyone at 3C' });
    expect(channelPreview({ ...base, description: '' })).toBeNull();
  });

  it('names the author by first name, or You', () => {
    expect(channelPreview({ ...base, lastMessage: last }, 'me')).toEqual({ who: 'Ana', text: 'Door knocking at 4' });
    expect(channelPreview({ ...base, lastMessage: last }, 'ana')).toEqual({ who: 'You', text: 'Door knocking at 4' });
  });

  it('hides a blocked author behind the description', () => {
    expect(channelPreview({ ...base, lastMessage: last }, 'me', new Set(['ana']))).toEqual({
      who: null,
      text: 'Everyone at 3C',
    });
  });
});

describe('formatUnreadCount', () => {
  it('caps at 99+', () => {
    expect(formatUnreadCount(1)).toBe('1');
    expect(formatUnreadCount(99)).toBe('99');
    expect(formatUnreadCount(UNREAD_COUNT_CAP)).toBe('99+');
  });
});
