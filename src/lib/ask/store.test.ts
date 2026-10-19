import { describe, expect, it } from 'vitest';
import { MAX_KNOWLEDGE_NOTES, loadNotes } from './store';

describe('loadNotes', () => {
  it('reads knowledge notes with a cap and returns them sorted', async () => {
    const limits: number[] = [];
    const docs = [
      { id: 'b', data: () => ({ title: 'B', body: 'b', order: 2 }) },
      { id: 'a', data: () => ({ title: 'A', body: 'a', order: 1 }) },
    ];
    const db = {
      collection: () => ({
        limit: (n: number) => {
          limits.push(n);
          return { get: async () => ({ size: docs.length, docs }) };
        },
      }),
    };
    const notes = await loadNotes(db as never);
    expect(limits).toEqual([MAX_KNOWLEDGE_NOTES]);
    expect(notes.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
