import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { anonymizeAskHistory } from './anonymizeHistory';

vi.mock('./store', () => ({ ASK_LOG: 'askLog', PRACTICE_LOG: 'practiceLog' }));

type Row = { id: string; uid: string; repName: string };

function fakeDb(rows: Record<string, Row[]>) {
  const updates: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  const db = {
    collection(name: string) {
      const make = (uid: string, limit: number, after?: string) => ({
        limit: (n: number) => make(uid, n, after),
        startAfter: (doc: { id: string }) => make(uid, limit, doc.id),
        async get() {
          const all = (rows[name] ?? []).filter((r) => r.uid === uid).sort((a, b) => a.id.localeCompare(b.id));
          const start = after ? all.findIndex((r) => r.id === after) + 1 : 0;
          const docs = all.slice(start, start + limit).map((r) => ({ id: r.id, ref: { collection: name, id: r.id } }));
          return { empty: docs.length === 0, docs };
        },
      });
      return { where: (_f: string, _op: string, uid: string) => make(uid, Infinity) };
    },
    batch() {
      const pending: typeof updates = [];
      return {
        update(ref: { collection: string; id: string }, data: Record<string, unknown>) {
          pending.push({ collection: ref.collection, id: ref.id, data });
        },
        async commit() {
          updates.push(...pending);
        },
      };
    },
  };
  return { db: db as unknown as Firestore, updates };
}

describe('anonymizeAskHistory', () => {
  it("re-stamps the person's Ask and Practice rows, and nobody else's", async () => {
    const { db, updates } = fakeDb({
      askLog: [
        { id: 'a1', uid: 'rep1', repName: 'Miles' },
        { id: 'a2', uid: 'rep2', repName: 'Sam' },
      ],
      practiceLog: [{ id: 'p1', uid: 'rep1', repName: 'Miles' }],
    });
    expect(await anonymizeAskHistory(db, 'rep1', 'Deleted user')).toBe(2);
    expect(updates).toEqual([
      { collection: 'askLog', id: 'a1', data: { repName: 'Deleted user' } },
      { collection: 'practiceLog', id: 'p1', data: { repName: 'Deleted user' } },
    ]);
  });

  it('pages past the batch limit', async () => {
    const many = Array.from({ length: 401 }, (_, i) => ({ id: `a${String(i).padStart(4, '0')}`, uid: 'rep1', repName: 'Miles' }));
    const { db, updates } = fakeDb({ askLog: many });
    expect(await anonymizeAskHistory(db, 'rep1', 'Deleted user')).toBe(401);
    expect(new Set(updates.map((u) => u.id)).size).toBe(401);
  });

  it('does nothing when there is no history', async () => {
    const { db, updates } = fakeDb({});
    expect(await anonymizeAskHistory(db, 'rep1', 'Deleted user')).toBe(0);
    expect(updates).toEqual([]);
  });
});
