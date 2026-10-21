// In-memory stand-in for the admin Firestore calls the knock area routes make: doc
// get/create/set/update/delete, where (==, >=, <=) / orderBy / limit / get, count().get(),
// runTransaction (reads as called, writes applied when the callback resolves) and a BulkWriter
// (create, delete with a lastUpdateTime precondition, onWriteError, close). Every write bumps the
// doc's updateTime. Tests only.
type Data = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };
type UpdateTime = { v: number };

function grpcError(code: number, message: string) {
  return Object.assign(new Error(message), { code });
}

export function createFakeKnockDb() {
  const store = new Map<string, Map<string, Data>>();
  const times = new Map<string, number>();
  let clock = 0;
  /** Paths whose next write fails with this gRPC code (once). */
  const failNext = new Map<string, number>();
  const coll = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const touch = (path: string) => times.set(path, ++clock);

  function seed(name: string, docs: Record<string, Data>) {
    for (const [id, d] of Object.entries(docs)) {
      coll(name).set(id, { ...d });
      touch(`${name}/${id}`);
    }
  }

  function docRef(name: string, id: string) {
    const path = `${name}/${id}`;
    const maybeFail = () => {
      const code = failNext.get(path);
      if (code !== undefined) {
        failNext.delete(path);
        throw grpcError(code, `injected failure ${code}`);
      }
    };
    const ref = {
      id,
      path,
      get: async () => snap(name, id),
      create: async (data: Data) => {
        maybeFail();
        if (coll(name).has(id)) throw grpcError(6, 'already exists');
        coll(name).set(id, { ...data });
        touch(path);
      },
      set: async (data: Data) => {
        maybeFail();
        coll(name).set(id, { ...data });
        touch(path);
      },
      update: async (data: Data) => {
        maybeFail();
        const cur = coll(name).get(id);
        if (!cur) throw grpcError(5, 'not found');
        coll(name).set(id, { ...cur, ...data });
        touch(path);
      },
      delete: async (pre?: { lastUpdateTime?: UpdateTime }) => {
        maybeFail();
        if (pre?.lastUpdateTime && (!coll(name).has(id) || times.get(path) !== pre.lastUpdateTime.v)) {
          throw grpcError(9, 'failed precondition');
        }
        coll(name).delete(id);
        times.delete(path);
      },
    };
    return ref;
  }

  function snap(name: string, id: string) {
    const data = coll(name).get(id);
    const t = times.get(`${name}/${id}`);
    return {
      id,
      ref: docRef(name, id),
      exists: data !== undefined,
      updateTime: t === undefined ? undefined : ({ v: t } as UpdateTime),
      data: () => (data ? structuredClone(data) : undefined),
    };
  }

  function matches(data: Data, f: Filter): boolean {
    const v = data[f.field] as never;
    const x = f.value as never;
    if (v === undefined) return false;
    switch (f.op) {
      case '==': return v === x;
      case '>=': return v >= x;
      case '<=': return v <= x;
      default: throw new Error(`fakeKnockDb: unsupported op ${f.op}`);
    }
  }

  type Order = { field: string; dir: 'asc' | 'desc' };
  const queries: { collection: string; filters: Filter[] }[] = [];
  function query(name: string, filters: Filter[], max?: number, order?: Order) {
    const run = () => {
      queries.push({ collection: name, filters });
      let ids = [...coll(name).entries()].filter(([, d]) => filters.every((f) => matches(d, f)));
      if (order) {
        const sign = order.dir === 'desc' ? -1 : 1;
        ids = ids
          .filter(([, d]) => d[order.field] !== undefined)
          .sort(([, a], [, b]) => {
            const x = a[order.field] as never;
            const y = b[order.field] as never;
            return x < y ? -sign : x > y ? sign : 0;
          });
      }
      if (max !== undefined) ids = ids.slice(0, max);
      return ids.map(([id]) => snap(name, id));
    };
    return {
      where: (field: string, op: string, value: unknown) => query(name, [...filters, { field, op, value }], max, order),
      limit: (n: number) => query(name, filters, n, order),
      orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => query(name, filters, max, { field, dir }),
      get: async () => {
        const docs = run();
        return { empty: docs.length === 0, size: docs.length, docs };
      },
      count: () => ({ get: async () => { const n = run().length; return { data: () => ({ count: n }) }; } }),
    };
  }

  type Ref = ReturnType<typeof docRef>;
  const db = {
    store,
    queries,
    failNext,
    seed,
    collection: (name: string) => ({
      ...query(name, []),
      doc: (id: string) => docRef(name, id),
    }),
    runTransaction: async <T>(fn: (tx: {
      get: (ref: Ref) => Promise<ReturnType<typeof snap>>;
      create: (ref: Ref, data: Data) => void;
      set: (ref: Ref, data: Data) => void;
      update: (ref: Ref, data: Data) => void;
      delete: (ref: Ref) => void;
    }) => Promise<T>): Promise<T> => {
      const writes: (() => Promise<void>)[] = [];
      const result = await fn({
        get: (ref) => ref.get(),
        create: (ref, data) => void writes.push(() => ref.create(data)),
        set: (ref, data) => void writes.push(() => ref.set(data)),
        update: (ref, data) => void writes.push(() => ref.update(data)),
        delete: (ref) => void writes.push(() => ref.delete()),
      });
      for (const w of writes) await w();
      return result;
    },
    bulkWriter: () => {
      const ops: (() => Promise<void>)[] = [];
      let onError: (e: Error & { code?: number; failedAttempts: number }) => boolean = () => false;
      const enqueue = (op: () => Promise<void>) =>
        new Promise<void>((resolve, reject) => {
          ops.push(async () => {
            for (let attempt = 1; ; attempt++) {
              try {
                await op();
                resolve();
                return;
              } catch (e) {
                const err = Object.assign(e as Error, { failedAttempts: attempt });
                if (!onError(err as Error & { code?: number; failedAttempts: number })) {
                  reject(err);
                  return;
                }
              }
            }
          });
        });
      return {
        onWriteError: (fn: typeof onError) => {
          onError = fn;
        },
        create: (ref: Ref, data: Data) => enqueue(() => ref.create(data)),
        delete: (ref: Ref, pre?: { lastUpdateTime?: UpdateTime }) => enqueue(() => ref.delete(pre)),
        close: async () => {
          for (const op of ops) await op();
        },
      };
    },
  };
  return db;
}

export type FakeKnockDb = ReturnType<typeof createFakeKnockDb>;
