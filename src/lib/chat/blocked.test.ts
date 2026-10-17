import { describe, expect, it } from 'vitest';
import { authorIndex, isBlockedQuote, shouldCollapseBlocked } from './blocked';

describe('isBlockedQuote', () => {
  const blocked = new Set(['cole']);
  it('uses the quote author when stamped', () => {
    expect(isBlockedQuote({ messageId: 'm1', authorId: 'cole', authorName: 'Cole', text: 'x' }, blocked)).toBe(true);
    expect(isBlockedQuote({ messageId: 'm1', authorId: 'ana', authorName: 'Ana', text: 'x' }, blocked)).toBe(false);
  });
  it('falls back to the loaded quoted message for older quotes', () => {
    const index = authorIndex([{ id: 'm1', authorId: 'cole' }]);
    expect(isBlockedQuote({ messageId: 'm1', authorName: 'Cole', text: 'x' }, blocked, index)).toBe(true);
    expect(isBlockedQuote({ messageId: 'm2', authorName: 'Cole', text: 'x' }, blocked, index)).toBe(false);
  });
  it('is false with no quote or no blocks', () => {
    expect(isBlockedQuote(undefined, blocked)).toBe(false);
    expect(isBlockedQuote({ messageId: 'm1', authorId: 'cole', authorName: 'Cole', text: 'x' }, new Set())).toBe(false);
  });
});

describe('shouldCollapseBlocked', () => {
  const blocked = new Set(['cole']);
  it('collapses a blocked author until shown, never your own', () => {
    expect(shouldCollapseBlocked({ id: 'm1', authorId: 'cole' }, 'me', blocked, new Set())).toBe(true);
    expect(shouldCollapseBlocked({ id: 'm1', authorId: 'cole' }, 'me', blocked, new Set(['m1']))).toBe(false);
    expect(shouldCollapseBlocked({ id: 'm1', authorId: 'ana' }, 'me', blocked, new Set())).toBe(false);
    expect(shouldCollapseBlocked({ id: 'm1', authorId: 'cole' }, 'cole', blocked, new Set())).toBe(false);
    expect(shouldCollapseBlocked({ id: 'm1', authorId: 'cole' }, 'me', undefined, new Set())).toBe(false);
  });
});
