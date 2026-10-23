import { describe, expect, it } from 'vitest';
import { createFakeAskDb } from './fakeAskDb';
import { MAX_KNOWLEDGE_NOTES, loadAskProfile, loadCountedSessions, loadNotes } from './store';

describe('loadAskProfile', () => {
  const db = (users: Record<string, Record<string, unknown>>) => createFakeAskDb({ users }).db as never;

  it("gives the manager's first name only, from reportsToId or the older managerId", async () => {
    const users = {
      rep: { city: 'Des Moines', state: 'IA', reportsToId: 'mgr', mainLine: 'solar' },
      old: { managerId: 'mgr' },
      mgr: { displayName: 'Dana Smith', email: 'dana@example.com' },
    };
    expect(await loadAskProfile(db(users), 'rep')).toEqual({ home: 'Des Moines, IA', mainLine: 'solar', managerFirstName: 'Dana' });
    expect((await loadAskProfile(db(users), 'old')).managerFirstName).toBe('Dana');
  });

  it('no manager, a missing manager doc, an email-only name or a self-link give no name', async () => {
    const users = {
      none: {},
      gone: { reportsToId: 'nobody' },
      mail: { reportsToId: 'm' },
      m: { displayName: 'm@example.com' },
      self: { reportsToId: 'self', displayName: 'Self Person' },
    };
    for (const uid of ['none', 'gone', 'mail', 'self']) {
      expect(await loadAskProfile(db(users), uid)).toEqual({ home: '', mainLine: null, managerFirstName: '' });
    }
  });
});

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

describe('loadCountedSessions', () => {
  /** A practiceLog stand-in: a createdAt range returns ascending unless ordered desc, then the cap applies. */
  function fakeLog(rows: { uid: string; createdAt: Date }[]) {
    const query = (filters: ((row: { uid: string; createdAt: Date }) => boolean)[], desc: boolean) => ({
      where: (field: string, op: string, value: unknown) =>
        query(
          [
            ...filters,
            (row: { uid: string; createdAt: Date }) =>
              field === 'uid' ? row.uid === value : op === '>=' ? row.createdAt >= (value as Date) : true,
          ],
          desc
        ),
      orderBy: (field: string, dir: string) => query(filters, field === 'createdAt' && dir === 'desc'),
      limit: (n: number) => ({
        get: async () => {
          const kept = rows
            .filter((row) => filters.every((f) => f(row)))
            .sort((a, b) => (desc ? -1 : 1) * (a.createdAt.getTime() - b.createdAt.getTime()))
            .slice(0, n);
          return {
            docs: kept.map((row, i) => ({
              id: String(i),
              data: () => ({ uid: row.uid, persona: 'skeptic', createdAt: row.createdAt, turns: [] }),
            })),
          };
        },
      }),
    });
    return { collection: () => query([], false) };
  }

  it("keeps everyone's newest sessions once the log passes the cap", async () => {
    const start = Date.UTC(2026, 0, 1);
    const rows = Array.from({ length: 2005 }, (_, i) => ({ uid: 'rep', createdAt: new Date(start + i * 60_000) }));
    const sessions = await loadCountedSessions(fakeLog(rows) as never, new Date(start), null);
    expect(sessions).toHaveLength(2000);
    expect(sessions.map((s) => s.createdAt)).toContain(rows[rows.length - 1].createdAt.toISOString());
  });
});
