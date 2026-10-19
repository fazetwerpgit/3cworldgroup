import { describe, expect, it } from 'vitest';
import { linkedChannelId } from './channelLink';

describe('linkedChannelId', () => {
  it('passes through a normal channel id', () => {
    expect(linkedChannelId('all-company')).toBe('all-company');
    expect(linkedChannelId('managers_2')).toBe('managers_2');
  });

  it('ignores a missing or empty value', () => {
    expect(linkedChannelId(null)).toBeNull();
    expect(linkedChannelId(undefined)).toBeNull();
    expect(linkedChannelId('')).toBeNull();
  });

  it('rejects values that are not a single Firestore document id', () => {
    // ?channel=a%2Fb decodes to 'a/b' -> chatChannels/a/b/messages (4 segments).
    expect(linkedChannelId('a/b')).toBeNull();
    expect(linkedChannelId('/')).toBeNull();
    expect(linkedChannelId('.')).toBeNull();
    expect(linkedChannelId('..')).toBeNull();
    expect(linkedChannelId('__reserved__')).toBeNull();
    expect(linkedChannelId('x'.repeat(1501))).toBeNull();
  });
});
