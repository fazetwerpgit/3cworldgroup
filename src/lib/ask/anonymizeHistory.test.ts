import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { anonymizeAskHistory, scrubName } from './anonymizeHistory';

vi.mock('./store', () => ({
  ASK_LOG: 'askLog',
  PRACTICE_LOG: 'practiceLog',
  PRACTICE_CORRECTIONS: 'practiceCorrections',
  PRACTICE_ASSIGNMENTS: 'practiceAssignments',
  PRACTICE_SESSIONS: 'practiceSessions',
}));

type Row = { id: string; repName: string } & Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };

function matches(row: Row, f: Filter): boolean {
  if (f.op === '==') return row[f.field] === f.value;
  if (f.op === 'in') {
    const values = f.value as unknown[];
    if (values.length > 30) throw new Error('in filter over 30 values');
    return values.includes(row[f.field]);
  }
  throw new Error(`unsupported op ${f.op}`);
}

function fakeDb(rows: Record<string, Row[]>) {
  const updates: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  const deleted: string[] = [];
  let commits = 0;
  const db = {
    collection(name: string) {
      const make = (filter: Filter, limit: number, after?: string) => ({
        limit: (n: number) => make(filter, n, after),
        startAfter: (doc: { id: string }) => make(filter, limit, doc.id),
        async get() {
          const all = (rows[name] ?? []).filter((r) => matches(r, filter)).sort((a, b) => a.id.localeCompare(b.id));
          const start = after ? all.findIndex((r) => r.id === after) + 1 : 0;
          const docs = all.slice(start, start + limit).map((r) => ({ id: r.id, ref: { collection: name, id: r.id }, data: () => ({ ...r }) }));
          return { empty: docs.length === 0, docs };
        },
      });
      return {
        where: (field: string, op: string, value: unknown) => make({ field, op, value }, Infinity),
        doc: (id: string) => ({
          async delete() {
            deleted.push(`${name}/${id}`);
          },
        }),
      };
    },
    batch() {
      const pending: typeof updates = [];
      return {
        update(ref: { collection: string; id: string }, data: Record<string, unknown>) {
          pending.push({ collection: ref.collection, id: ref.id, data });
        },
        async commit() {
          commits++;
          updates.push(...pending);
        },
      };
    },
  };
  return { db: db as unknown as Firestore, updates, deleted, commits: () => commits };
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

  it("re-stamps corrections on the person's sessions and assignments made for them", async () => {
    const { db, updates } = fakeDb({
      practiceLog: [
        { id: 'p1', uid: 'rep1', repName: 'Miles' },
        { id: 'p2', uid: 'rep2', repName: 'Sam' },
      ],
      practiceCorrections: [
        { id: 'c1', logId: 'p1', repName: 'Miles' },
        { id: 'c2', logId: 'p2', repName: 'Sam' },
      ],
      practiceAssignments: [
        { id: 'as1', repUid: 'rep1', repName: 'Miles' },
        { id: 'as2', repUid: 'rep2', repName: 'Sam' },
        { id: 'as3', repUid: null, repName: '' },
      ],
    });
    expect(await anonymizeAskHistory(db, 'rep1', 'Deleted user')).toBe(3);
    expect(updates.map((u) => `${u.collection}/${u.id}`)).toEqual([
      'practiceLog/p1',
      'practiceCorrections/c1',
      'practiceAssignments/as1',
    ]);
    expect(updates.every((u) => u.data.repName === 'Deleted user')).toBe(true);
  });

  it('looks corrections up in chunks of 30 session ids', async () => {
    const logs = Array.from({ length: 65 }, (_, i) => ({ id: `p${String(i).padStart(3, '0')}`, uid: 'rep1', repName: 'Miles' }));
    const corrections = logs.map((log, i) => ({ id: `c${String(i).padStart(3, '0')}`, logId: log.id, repName: 'Miles' }));
    const { db, updates, commits } = fakeDb({ practiceLog: logs, practiceCorrections: corrections });
    expect(await anonymizeAskHistory(db, 'rep1', 'Deleted user')).toBe(130);
    expect(updates.filter((u) => u.collection === 'practiceCorrections')).toHaveLength(65);
    // One batch for the log page, three for the correction chunks.
    expect(commits()).toBe(4);
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

  it("takes the rep's name out of kept Practice feedback, transcripts and corrections, and deletes the live session", async () => {
    const { db, updates, deleted } = fakeDb({
      practiceLog: [
        {
          id: 'p1',
          uid: 'rep1',
          repName: 'Mason Reed',
          feedback: 'Try this line: "Hi, I\'m Mason with 3C." Mason will close more doors.',
          turns: [
            { role: 'rep', text: "Hi, I'm Mason Reed with 3C" },
            { role: 'customer', text: 'What do you want, masonry?' },
          ],
        },
        { id: 'p2', uid: 'rep2', repName: 'Sam', feedback: 'Hi, I\'m Sam', turns: [{ role: 'rep', text: "I'm Sam" }] },
      ],
      practiceCorrections: [
        { id: 'c1', logId: 'p1', repName: 'Mason Reed', original: 'Try this line: "Hi, I\'m Mason."', take: 'Mason should ask first.' },
        { id: 'c2', logId: 'p2', repName: 'Sam', original: "Hi, I'm Sam", take: '' },
      ],
    });
    await anonymizeAskHistory(db, 'rep1', 'Deleted user');
    const p1 = updates.find((u) => u.id === 'p1')!.data;
    expect(p1).toEqual({
      repName: 'Deleted user',
      feedback: 'Try this line: "Hi, I\'m [rep] with 3C." [rep] will close more doors.',
      turns: [
        { role: 'rep', text: "Hi, I'm [rep] [rep] with 3C" },
        { role: 'customer', text: 'What do you want, masonry?' },
      ],
    });
    expect(updates.find((u) => u.id === 'c1')!.data).toEqual({
      repName: 'Deleted user',
      original: 'Try this line: "Hi, I\'m [rep]."',
      take: '[rep] should ask first.',
    });
    expect(updates.some((u) => u.id === 'p2' || u.id === 'c2')).toBe(false);
    expect(deleted).toEqual(['practiceSessions/rep1']);
    expect(JSON.stringify(updates)).not.toContain('Mason');
  });

  it('leaves text alone on a row that was already re-stamped (a retried delete)', async () => {
    const { db, updates } = fakeDb({
      practiceLog: [{ id: 'p1', uid: 'rep1', repName: 'Deleted user', feedback: 'Deleted user did fine.' }],
    });
    await anonymizeAskHistory(db, 'rep1', 'Deleted user');
    expect(updates).toEqual([{ collection: 'practiceLog', id: 'p1', data: { repName: 'Deleted user' } }]);
  });
});

describe('scrubName', () => {
  it('replaces whole, same-case words only', () => {
    expect(scrubName('Will will go. Willow. Will.', ['Will'])).toBe('[rep] will go. Willow. [rep].');
    expect(scrubName('José, José!', ['José'])).toBe('[rep], [rep]!');
    expect(scrubName('a.b a+b', ['a.b'])).toBe('[rep] a+b');
  });
});
