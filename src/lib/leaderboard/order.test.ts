import { describe, expect, it } from 'vitest';
import { boardOrder } from './order';

describe('boardOrder', () => {
  it('ranks by score, then breaks ties by name, then id', () => {
    const rows = [
      { score: 20, name: 'Jordan Price', id: 'a' },
      { score: 30, name: 'Zed', id: 'z' },
      { score: 20, name: 'Casey Rivera', id: 'b' },
      { score: 20, name: 'Casey Rivera', id: 'a' },
    ];
    expect(rows.sort(boardOrder).map((r) => `${r.name}/${r.id}`)).toEqual([
      'Zed/z',
      'Casey Rivera/a',
      'Casey Rivera/b',
      'Jordan Price/a',
    ]);
  });
});
