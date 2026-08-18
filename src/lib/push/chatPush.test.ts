import { describe, expect, it } from 'vitest';
import {
  CHAT_PUSH_MAX_RECIPIENTS,
  buildChatPushBody,
  resolveChatPushRecipients,
} from './chatPush';

describe('resolveChatPushRecipients', () => {
  it('notifies every member except the author', () => {
    const data = { memberIds: ['author', 'a', 'b'] };
    expect(resolveChatPushRecipients(data, 'author')).toEqual(['a', 'b']);
  });

  it('returns nothing when the author is the only member', () => {
    expect(resolveChatPushRecipients({ memberIds: ['author'] }, 'author')).toEqual([]);
  });

  it('treats a missing or malformed memberIds as an empty roster', () => {
    expect(resolveChatPushRecipients({}, 'author')).toEqual([]);
    expect(resolveChatPushRecipients({ memberIds: 'not-an-array' }, 'author')).toEqual([]);
  });

  it('drops non-string and empty member ids', () => {
    const data = { memberIds: ['a', '', null, 42, undefined, 'b'] };
    expect(resolveChatPushRecipients(data, 'author')).toEqual(['a', 'b']);
  });

  it('de-duplicates a roster that lists the same uid twice', () => {
    expect(resolveChatPushRecipients({ memberIds: ['a', 'a', 'b'] }, 'author')).toEqual(['a', 'b']);
  });

  it('caps the fan-out at the safety bound', () => {
    const memberIds = Array.from({ length: 120 }, (_, i) => `user-${i}`);
    const recipients = resolveChatPushRecipients({ memberIds }, 'nobody');
    expect(recipients).toHaveLength(CHAT_PUSH_MAX_RECIPIENTS);
    expect(CHAT_PUSH_MAX_RECIPIENTS).toBe(50);
    expect(recipients[0]).toBe('user-0');
  });
});

describe('buildChatPushBody', () => {
  it('prefixes the sender name to the message text', () => {
    expect(buildChatPushBody('Real User', 'hello team')).toBe('Real User: hello team');
  });

  it('truncates long text to 120 characters including the ellipsis', () => {
    const body = buildChatPushBody('Sender', 'x'.repeat(300));
    const said = body.slice('Sender: '.length);
    expect(said).toHaveLength(120);
    expect(said.endsWith('…')).toBe(true);
  });

  it('leaves text of exactly 120 characters untruncated', () => {
    const text = 'y'.repeat(120);
    expect(buildChatPushBody('Sender', text)).toBe(`Sender: ${text}`);
  });

  it('describes an attachment-only message by its kind', () => {
    expect(buildChatPushBody('Sender', '', { type: 'image', url: 'https://x/y.png' })).toBe(
      'Sender sent a photo'
    );
    expect(buildChatPushBody('Sender', '', { type: 'gif', url: 'https://x/y.gif' })).toBe(
      'Sender sent a GIF'
    );
  });

  it('prefers the text over the attachment when a message has both', () => {
    expect(buildChatPushBody('Sender', 'look at this', { type: 'gif', url: 'https://x/y.gif' })).toBe(
      'Sender: look at this'
    );
  });

  it('falls back to a generic body when there is neither text nor attachment', () => {
    expect(buildChatPushBody('Sender', '   ')).toBe('Sender sent a message');
  });
});
