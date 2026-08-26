import { describe, expect, it } from 'vitest';
import { buildNameIndex, matchOrder, normalizeRepName } from './matchReps';

describe('normalizeRepName', () => {
  it('removes punctuation, normalizes case and diacritics, and collapses spaces', () => {
    expect(normalizeRepName("  Cooper O'Tool  ")).toBe('cooper otool');
    expect(normalizeRepName('  JOSÉ   García ')).toBe('jose garcia');
    expect(normalizeRepName(null)).toBe('');
  });
});

describe('buildNameIndex', () => {
  it('indexes full names and an unambiguous first/last fallback', () => {
    const index = buildNameIndex([
      { uid: 'cooper', displayName: 'Cooper James O\'Tool' },
      { uid: 'will', displayName: 'Will Teasdale' },
    ]);

    expect(index.get('cooper james otool')).toBe('cooper');
    expect(index.get('cooper otool')).toBe('cooper');
    expect(index.get('will teasdale')).toBe('will');
  });

  it('removes an ambiguous loose key without deleting full-name keys', () => {
    const index = buildNameIndex([
      { uid: 'first', displayName: 'Alex James Smith' },
      { uid: 'second', displayName: 'Alex Lee Smith' },
      { uid: 'exact', displayName: 'Alex Smith' },
    ]);

    expect(index.has('alex smith')).toBe(true);
    expect(index.get('alex smith')).toBe('exact');
    expect(index.get('alex james smith')).toBe('first');
    expect(index.get('alex lee smith')).toBe('second');
  });

  it('does not re-add a loose key after a third colliding name', () => {
    const index = buildNameIndex([
      { uid: 'first', displayName: 'Jordan James Lee' },
      { uid: 'second', displayName: 'Jordan Taylor Lee' },
      { uid: 'third', displayName: 'Jordan Morgan Lee' },
    ]);

    expect(index.has('jordan lee')).toBe(false);
    expect(index.get('jordan james lee')).toBe('first');
    expect(index.get('jordan taylor lee')).toBe('second');
    expect(index.get('jordan morgan lee')).toBe('third');
  });
});

describe('matchOrder', () => {
  it('uses dealer mappings before name matches and falls back to loose names', () => {
    const index = buildNameIndex([{ uid: 'name-user', displayName: 'Nolan James Morrison' }]);

    expect(matchOrder(
      { repDealerId: 'dealer-1', repName: 'Nolan James Morrison' },
      { 'dealer-1': 'dealer-user' },
      index,
    )).toBe('dealer-user');
    expect(matchOrder(
      { repDealerId: '', repName: 'Nolan Morrison' },
      {},
      index,
    )).toBe('name-user');
    expect(matchOrder(
      { repDealerId: '', repName: 'Unknown Rep' },
      {},
      index,
    )).toBeNull();
  });
});
