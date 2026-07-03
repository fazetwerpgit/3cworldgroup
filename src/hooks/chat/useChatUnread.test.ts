import { describe, it, expect } from 'vitest';
import { computeUnread } from './useChatUnread';

const earlier = new Date('2026-07-02T10:00:00Z');
const later = new Date('2026-07-02T12:00:00Z');

describe('computeUnread', () => {
  it('is not unread when the channel has no last-message time', () => {
    expect(computeUnread(null, null)).toBe(false);
    expect(computeUnread(undefined, later)).toBe(false);
    // Guards the own-send window: a pending serverTimestamp can surface as null.
    expect(computeUnread(null, earlier)).toBe(false);
  });

  it('is unread when there is a message but no read receipt', () => {
    expect(computeUnread(later, null)).toBe(true);
    expect(computeUnread(later, undefined)).toBe(true);
  });

  it('is unread when the last message is newer than the read receipt', () => {
    expect(computeUnread(later, earlier)).toBe(true);
  });

  it('is read when the receipt is at or after the last message', () => {
    expect(computeUnread(earlier, later)).toBe(false);
    expect(computeUnread(later, later)).toBe(false);
  });
});
