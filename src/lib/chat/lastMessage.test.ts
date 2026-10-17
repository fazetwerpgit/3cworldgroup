import { describe, expect, it } from 'vitest';
import { LAST_MESSAGE_SNIPPET_MAX, buildLastMessage, lastMessageSnippet, readLastMessage } from './lastMessage';

describe('lastMessageSnippet', () => {
  it('keeps short text as one line', () => {
    expect(lastMessageSnippet('  Door knock\n\nat 5  ')).toBe('Door knock at 5');
  });

  it('caps long text at 120 characters with an ellipsis', () => {
    const snippet = lastMessageSnippet('a'.repeat(300));
    expect(snippet).toHaveLength(LAST_MESSAGE_SNIPPET_MAX);
    expect(snippet.endsWith('…')).toBe(true);
    expect(lastMessageSnippet('b'.repeat(120))).toBe('b'.repeat(120));
  });

  it('names attachment-only messages by kind', () => {
    expect(lastMessageSnippet('', { type: 'image', url: 'x' })).toBe('Photo');
    expect(lastMessageSnippet('   ', { type: 'gif', url: 'x' })).toBe('GIF');
    expect(lastMessageSnippet(undefined, { type: 'file', url: 'x', name: 'Route map.pdf' })).toBe('File');
  });

  it('prefers the caption over the attachment', () => {
    expect(lastMessageSnippet('Look at this', { type: 'image', url: 'x' })).toBe('Look at this');
  });

  it('is empty for nothing at all', () => {
    expect(lastMessageSnippet(null)).toBe('');
  });
});

describe('buildLastMessage', () => {
  it('stamps the id, author and snippet', () => {
    expect(buildLastMessage('m1', { authorId: 'u1', authorName: 'Dana', text: 'hi' })).toEqual({
      messageId: 'm1',
      authorId: 'u1',
      authorName: 'Dana',
      text: 'hi',
    });
  });

  it('falls back to a generic author name', () => {
    expect(buildLastMessage('m1', { authorId: 'u1', text: 'hi' }).authorName).toBe('3C User');
  });
});

describe('readLastMessage', () => {
  it('reads a stored preview', () => {
    expect(readLastMessage({ messageId: 'm1', authorId: 'u1', authorName: 'Dana', text: 'hi' })?.text).toBe('hi');
  });

  it('rejects missing or malformed values', () => {
    expect(readLastMessage(undefined)).toBeNull();
    expect(readLastMessage({ text: 'hi' })).toBeNull();
    expect(readLastMessage({ messageId: 'm1', text: 3 })).toBeNull();
  });
});
