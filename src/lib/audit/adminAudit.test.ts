import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const state = { fail: false };
  return {
    rows,
    state,
    adminDb: {
      collection: (name: string) => ({
        add: async (row: Record<string, unknown>) => {
          if (state.fail) throw new Error('firestore down');
          rows.push({ collection: name, ...row });
        },
      }),
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));

import { changedLeaves, writeAdminAudit } from './adminAudit';

beforeEach(() => {
  db.rows.length = 0;
  db.state.fail = false;
});

describe('writeAdminAudit', () => {
  it('records who did what to whom and when, in adminAuditLog', async () => {
    await writeAdminAudit({
      action: 'user.update',
      actorUid: 'admin-1',
      actorName: 'Admin One',
      targetUid: 'rep-1',
      targetName: 'Rep One',
      details: { fields: ['phone'], status: { from: 'inactive', to: 'active' } },
    });

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      collection: 'adminAuditLog',
      action: 'user.update',
      actorUid: 'admin-1',
      targetUid: 'rep-1',
      details: { fields: ['phone'], status: { from: 'inactive', to: 'active' } },
    });
    expect(db.rows[0].at).toBeInstanceOf(Date);
  });

  it('never throws when the write fails: the admin action is already committed', async () => {
    db.state.fail = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      writeAdminAudit({ action: 'user.delete', actorUid: 'a', actorName: 'A', targetUid: 'r' })
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('changedLeaves', () => {
  it('lists only the rates that changed, with before and after', () => {
    const before = { entry_rep: { tfiber: { base: 100, override: 0 } }, l1_manager: { tfiber: { base: 150 } } };
    const after = { entry_rep: { tfiber: { base: 110, override: 0 } }, l1_manager: { tfiber: { base: 150 } } };

    expect(changedLeaves(before, after)).toEqual([{ path: 'entry_rep.tfiber.base', from: 100, to: 110 }]);
  });

  it('treats a rate that appears or disappears as a change from/to null', () => {
    expect(changedLeaves({ a: { x: 1 } }, { a: { x: 1, y: 2 } })).toEqual([{ path: 'a.y', from: null, to: 2 }]);
    expect(changedLeaves({ a: { x: 1, y: 2 } }, { a: { x: 1 } })).toEqual([{ path: 'a.y', from: 2, to: null }]);
  });

  it('reports nothing for an identical save, and everything when there was no previous plan', () => {
    expect(changedLeaves({ a: { x: 1 } }, { a: { x: 1 } })).toEqual([]);
    expect(changedLeaves(undefined, { a: { x: 1 } })).toEqual([{ path: 'a.x', from: null, to: 1 }]);
  });
});
