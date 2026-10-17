import { describe, expect, it, vi } from 'vitest';

// FieldValue sentinels the fake db below can apply.
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...items: unknown[]) => ({ __op: 'union', items }),
    arrayRemove: (...items: unknown[]) => ({ __op: 'remove', items }),
    serverTimestamp: () => ({ __op: 'ts' }),
  },
}));

import type { Firestore } from 'firebase-admin/firestore';
import { claimPushToken } from './claimPushToken';

type Doc = Record<string, unknown>;
type Op = { __op: 'union' | 'remove' | 'ts'; items?: unknown[] };

const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)]));
  return v;
}

function apply(doc: Doc, data: Doc) {
  for (const [field, value] of Object.entries(data)) {
    const op = value as Op;
    if (op && typeof op === 'object' && '__op' in op) {
      const list = Array.isArray(doc[field]) ? [...(doc[field] as unknown[])] : [];
      if (op.__op === 'ts') doc[field] = 'TS';
      else if (op.__op === 'union') {
        for (const item of op.items!) if (!list.some((x) => same(x, item))) list.push(item);
        doc[field] = list;
      } else doc[field] = list.filter((x) => !op.items!.some((item) => same(x, item)));
    } else doc[field] = value;
  }
}

/** In-memory users collection: array-contains queries + transactions (writes applied at commit). */
function fakeDb(initial: Record<string, Doc>) {
  const docs = new Map(Object.entries(initial).map(([id, d]) => [id, structuredClone(d)]));
  const writes: Array<{ kind: 'update' | 'set'; id: string; data: Doc }> = [];
  const ref = (id: string) => ({ id, path: `users/${id}` });
  const users = {
    doc: (id: string) => ref(id),
    where: (field: string, op: string, value: unknown) => {
      expect(op).toBe('array-contains');
      return { field, value };
    },
  };
  const db = {
    collection: (name: string) => {
      expect(name).toBe('users');
      return users;
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const pending: typeof writes = [];
      const tx = {
        get: async (q: { field: string; value: unknown }) => ({
          docs: [...docs.entries()]
            .filter(([, d]) => Array.isArray(d[q.field]) && (d[q.field] as unknown[]).some((x) => same(x, q.value)))
            .map(([id]) => ({ id, ref: ref(id) })),
        }),
        update: (r: { id: string }, data: Doc) => {
          if (!docs.has(r.id)) throw new Error('update of a missing doc');
          pending.push({ kind: 'update', id: r.id, data });
        },
        set: (r: { id: string }, data: Doc) => pending.push({ kind: 'set', id: r.id, data }),
      };
      const result = await fn(tx);
      for (const w of pending) {
        const doc = docs.get(w.id) ?? {};
        apply(doc, w.data);
        docs.set(w.id, doc);
        writes.push(w);
      }
      return result;
    },
  };
  return { db: db as unknown as Firestore, docs, writes };
}

const native = (token: string) => ({ token, platform: 'ios-native' });

describe('claimPushToken', () => {
  it("moves a native token off rep A's doc when rep B registers it (phone switched users)", async () => {
    const f = fakeDb({
      repA: { nativePushTokens: [native('phone-1'), native('ipad-a')], pushTokens: ['web-a'] },
      repB: { nativePushTokens: [] },
    });
    const out = await claimPushToken(f.db, 'repB', 'phone-1', 'ios-native');
    expect(out.removedFrom).toEqual(['repA']);
    expect(f.docs.get('repA')).toEqual({ nativePushTokens: [native('ipad-a')], pushTokens: ['web-a'] });
    expect(f.docs.get('repB')).toEqual({ nativePushTokens: [native('phone-1')], pushTokensUpdatedAt: 'TS' });
  });

  it('moves a web token the same way, from every other holder', async () => {
    const f = fakeDb({ a: { pushTokens: ['w1', 'w2'] }, c: { pushTokens: ['w1'] }, b: {} });
    const out = await claimPushToken(f.db, 'b', 'w1', 'web');
    expect(out.removedFrom.sort()).toEqual(['a', 'c']);
    expect(f.docs.get('a')!.pushTokens).toEqual(['w2']);
    expect(f.docs.get('c')!.pushTokens).toEqual([]);
    expect(f.docs.get('b')!.pushTokens).toEqual(['w1']);
  });

  it('clears both lists on another doc with one update', async () => {
    const f = fakeDb({ a: { pushTokens: ['t'], nativePushTokens: [native('t')] }, b: {} });
    await claimPushToken(f.db, 'b', 't', 'ios-native');
    expect(f.writes.filter((w) => w.id === 'a')).toHaveLength(1);
    expect(f.docs.get('a')).toEqual({ pushTokens: [], nativePushTokens: [] });
  });

  it('leaves the caller alone and touches no one else when nobody else holds it (idempotent)', async () => {
    const f = fakeDb({ b: { nativePushTokens: [native('t')] }, a: { nativePushTokens: [native('other')] } });
    expect((await claimPushToken(f.db, 'b', 't', 'ios-native')).removedFrom).toEqual([]);
    expect((await claimPushToken(f.db, 'b', 't', 'ios-native')).removedFrom).toEqual([]);
    expect(f.writes.every((w) => w.id === 'b' && w.kind === 'set')).toBe(true);
    expect(f.docs.get('b')!.nativePushTokens).toEqual([native('t')]);
    expect(f.docs.get('a')!.nativePushTokens).toEqual([native('other')]);
  });

  it('matches the stored map regardless of key order, and only the exact token', async () => {
    const f = fakeDb({ a: { nativePushTokens: [{ platform: 'ios-native', token: 't' }, native('t2')] }, b: {} });
    await claimPushToken(f.db, 'b', 't', 'ios-native');
    expect(f.docs.get('a')!.nativePushTokens).toEqual([native('t2')]);
  });
});
