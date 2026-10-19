import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// pendingPhotos against a small in-memory IndexedDB (open / transaction /
// put / get / getAllKeys / delete), with switches for the failure paths.

type Req<T = unknown> = { result: T; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void; onblocked?: () => void };

interface FakeIdb {
  stores: Map<string, Map<IDBValidKey, unknown>>;
  opens: number;
  /** readwrite transactions started. */
  writes: number;
  /** How the next open() ends. */
  openOutcome: 'success' | 'error' | 'blocked' | 'throw';
  /** How the next transaction ends. */
  txOutcome: 'complete' | 'error' | 'abort' | 'throw';
  /** Connection lost: transaction() throws until the database is reopened. */
  dead: boolean;
  closes: number;
  db: { onclose?: (() => void) | null; onversionchange?: (() => void) | null };
}

function installFakeIndexedDb(): FakeIdb {
  const fake = { stores: new Map(), opens: 0, writes: 0, openOutcome: 'success', txOutcome: 'complete', dead: false, closes: 0 } as Omit<FakeIdb, 'db'> as FakeIdb;
  const db: FakeIdb['db'] & Record<string, unknown> = {
    close: () => {
      fake.closes += 1;
    },
    objectStoreNames: { contains: (name: string) => fake.stores.has(name) },
    createObjectStore: (name: string) => {
      fake.stores.set(name, new Map());
    },
    transaction: (name: string, mode: IDBTransactionMode) => {
      if (fake.dead) throw new DOMException('Connection to Indexed Database server lost', 'InvalidStateError');
      if (fake.txOutcome === 'throw') throw new DOMException('closing', 'InvalidStateError');
      const outcome = fake.txOutcome;
      if (mode === 'readwrite') fake.writes += 1;
      const data = fake.stores.get(name)!;
      // Writes land only if the transaction commits.
      const staged = new Map(data);
      const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          put: (record: { id: string }) => {
            if (mode !== 'readwrite') throw new DOMException('read only', 'ReadOnlyError');
            staged.set(record.id, structuredClone(record));
            return { result: record.id };
          },
          get: (key: IDBValidKey) => ({ result: staged.get(key) }),
          getAllKeys: () => ({ result: [...staged.keys()] }),
          delete: (key: IDBValidKey) => {
            if (mode !== 'readwrite') throw new DOMException('read only', 'ReadOnlyError');
            staged.delete(key);
            return { result: undefined };
          },
        }),
      };
      setTimeout(() => {
        if (outcome === 'complete') {
          data.clear();
          for (const [k, v] of staged) data.set(k, v);
          tx.oncomplete?.();
        } else if (outcome === 'error') tx.onerror?.();
        else tx.onabort?.();
      }, 0);
      return tx;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: (name: string, version: number) => {
      expect([name, version]).toEqual(['3c-chat-outbox', 1]);
      fake.opens += 1;
      fake.dead = false;
      if (fake.openOutcome === 'throw') throw new DOMException('denied', 'SecurityError');
      const outcome = fake.openOutcome;
      const request: Req = { result: db };
      setTimeout(() => {
        if (outcome === 'success') {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        } else if (outcome === 'error') request.onerror?.();
        else request.onblocked?.();
      }, 0);
      return request;
    },
  });
  fake.db = db;
  return fake;
}

let idb: FakeIdb;
let mod: typeof import('./pendingPhotos');

beforeEach(async () => {
  idb = installFakeIndexedDb();
  // The module caches its open database; each test gets a fresh one.
  vi.resetModules();
  mod = await import('./pendingPhotos');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const photo = (name = 'porch.jpg', type = 'image/jpeg', body = 'jpeg-bytes') => new File([body], name, { type });

describe('savePendingPhoto / loadPendingPhoto', () => {
  it('keeps the picked file across a reload and gives back a File with its name, type and bytes', async () => {
    await mod.savePendingPhoto('u1_echo1', photo());
    vi.resetModules();
    const fresh = await import('./pendingPhotos');
    const file = await fresh.loadPendingPhoto('u1_echo1');
    expect(file).toBeInstanceOf(File);
    expect(file!.name).toBe('porch.jpg');
    expect(file!.type).toBe('image/jpeg');
    expect(await file!.text()).toBe('jpeg-bytes');
  });

  it('stores when it was saved', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await mod.savePendingPhoto('u1_echo1', photo());
    expect((idb.stores.get('photos')!.get('u1_echo1') as { savedAt: number }).savedAt).toBe(1_700_000_000_000);
    vi.restoreAllMocks();
  });

  it('is null for an id it never saved, or a record without a blob', async () => {
    expect(await mod.loadPendingPhoto('u1_nope')).toBeNull();
    idb.stores.get('photos')!.set('u1_bad', { id: 'u1_bad', blob: 'not a blob', name: 'x', type: 'image/png', savedAt: 1 });
    expect(await mod.loadPendingPhoto('u1_bad')).toBeNull();
  });

  it("falls back to 'photo' and the blob's own type when the name or type is missing", async () => {
    await mod.savePendingPhoto('u1_e', photo('porch.jpg', 'image/png'));
    const record = idb.stores.get('photos')!.get('u1_e') as Record<string, unknown>;
    idb.stores.get('photos')!.set('u1_e', { ...record, name: '', type: '' });
    const file = await mod.loadPendingPhoto('u1_e');
    expect(file!.name).toBe('photo');
    expect(file!.type).toBe('image/png');
  });

  it('opens the database once and reuses it', async () => {
    await mod.savePendingPhoto('u1_a', photo());
    await mod.loadPendingPhoto('u1_a');
    await mod.prunePendingPhotos('u1', new Set(['u1_a']));
    expect(idb.opens).toBe(1);
  });
});

describe('prunePendingPhotos', () => {
  it("drops only this user's photos that no queued message needs", async () => {
    for (const id of ['u1_keep', 'u1_stale1', 'u1_stale2', 'u10_other', 'u2_other']) await mod.savePendingPhoto(id, photo());
    await mod.prunePendingPhotos('u1', new Set(['u1_keep']));
    expect([...idb.stores.get('photos')!.keys()].sort()).toEqual(['u10_other', 'u1_keep', 'u2_other']);
  });

  it('writes nothing when there is nothing stale', async () => {
    await mod.savePendingPhoto('u1_keep', photo());
    const writesBefore = idb.writes;
    await mod.prunePendingPhotos('u1', new Set(['u1_keep']));
    expect([...idb.stores.get('photos')!.keys()]).toEqual(['u1_keep']);
    expect(idb.writes).toBe(writesBefore);
  });
});

describe('best-effort when storage is missing, blocked or failing', () => {
  it('resolves (null / no-op) with no IndexedDB at all', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.resetModules();
    const bare = await import('./pendingPhotos');
    await expect(bare.savePendingPhoto('u1_a', photo())).resolves.toBeUndefined();
    await expect(bare.loadPendingPhoto('u1_a')).resolves.toBeNull();
    await expect(bare.prunePendingPhotos('u1', new Set())).resolves.toBeUndefined();
  });

  it.each(['error', 'blocked', 'throw'] as const)('resolves when open() ends in %s, and tries again on the next call', async (outcome) => {
    idb.openOutcome = outcome;
    await expect(mod.savePendingPhoto('u1_a', photo())).resolves.toBeUndefined();
    await expect(mod.loadPendingPhoto('u1_a')).resolves.toBeNull();
    expect(idb.opens).toBe(2);
    idb.openOutcome = 'success';
    await mod.savePendingPhoto('u1_a', photo());
    expect(await mod.loadPendingPhoto('u1_a')).not.toBeNull();
  });

  it.each(['error', 'abort', 'throw'] as const)('resolves, saving nothing, when the transaction ends in %s', async (outcome) => {
    await mod.loadPendingPhoto('warm-up');
    idb.txOutcome = outcome;
    await expect(mod.savePendingPhoto('u1_a', photo())).resolves.toBeUndefined();
    await expect(mod.loadPendingPhoto('u1_a')).resolves.toBeNull();
    await expect(mod.prunePendingPhotos('u1', new Set())).resolves.toBeUndefined();
    idb.txOutcome = 'complete';
    expect(idb.stores.get('photos')!.has('u1_a')).toBe(false);
  });
});

describe('lost connection (iOS closes IndexedDB behind a backgrounded app)', () => {
  it('reopens and still saves when the cached handle has gone dead', async () => {
    await mod.loadPendingPhoto('warm-up');
    expect(idb.opens).toBe(1);
    idb.dead = true;
    await mod.savePendingPhoto('u1_a', photo());
    expect(idb.opens).toBe(2);
    expect(idb.closes).toBe(1);
    expect(idb.stores.get('photos')!.has('u1_a')).toBe(true);
    expect(await mod.loadPendingPhoto('u1_a')).not.toBeNull();
    expect(idb.opens).toBe(2);
  });

  it.each(['onclose', 'onversionchange'] as const)('opens a fresh connection after %s fires', async (event) => {
    await mod.savePendingPhoto('u1_a', photo());
    expect(idb.opens).toBe(1);
    idb.db[event]!();
    expect(await mod.loadPendingPhoto('u1_a')).not.toBeNull();
    expect(idb.opens).toBe(2);
  });

  it('gives up after one reopen when transactions keep throwing', async () => {
    await mod.loadPendingPhoto('warm-up');
    idb.txOutcome = 'throw';
    await expect(mod.savePendingPhoto('u1_a', photo())).resolves.toBeUndefined();
    expect(idb.opens).toBe(2);
  });
});
