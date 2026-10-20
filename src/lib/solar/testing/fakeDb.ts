// Minimal in-memory stand-in for the admin Firestore calls the solar routes
// make (doc get/create/update, add, where/limit/get, collection get, and a
// runTransaction whose writes apply when the callback resolves). Tests only.
type Data = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };

function snap(id: string, data: Data | undefined) {
  return {
    id,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
    get: (field: string) => data?.[field],
  };
}

function matches(data: Data, f: Filter): boolean {
  const v = data[f.field] as never;
  const x = f.value as never;
  switch (f.op) {
    case '==': return v === x;
    case '>=': return v >= x;
    case '<': return v < x;
    case 'in': return Array.isArray(x) && (x as unknown[]).includes(v);
    default: throw new Error(`fakeDb: unsupported op ${f.op}`);
  }
}

export function createFakeDb(seed: Record<string, Record<string, Data>> = {}) {
  const store = new Map<string, Map<string, Data>>();
  for (const [name, docs] of Object.entries(seed)) store.set(name, new Map(Object.entries(docs)));
  let auto = 0;
  const coll = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  function query(name: string, filters: Filter[], max?: number) {
    return {
      where: (field: string, op: string, value: unknown) => query(name, [...filters, { field, op, value }], max),
      limit: (n: number) => query(name, filters, n),
      get: async () => {
        let docs = [...coll(name).entries()].filter(([, d]) => filters.every((f) => matches(d, f)));
        if (max !== undefined) docs = docs.slice(0, max);
        const out = docs.map(([id, d]) => snap(id, d));
        return { empty: out.length === 0, size: out.length, docs: out };
      },
    };
  }

  type DocRef = {
    get: () => Promise<ReturnType<typeof snap>>;
    update: (data: Data) => Promise<void>;
    create: (data: Data) => Promise<void>;
    set: (data: Data) => Promise<void>;
    delete: () => Promise<void>;
  };
  const db = {
    store,
    // Reads run as they are called; writes are queued and applied in order when
    // the callback resolves (a create() that finds the doc throws code 6 then,
    // as a real commit does). No contention retries.
    runTransaction: async <T>(fn: (tx: {
      get: (ref: DocRef) => Promise<ReturnType<typeof snap>>;
      update: (ref: DocRef, data: Data) => void;
      create: (ref: DocRef, data: Data) => void;
      set: (ref: DocRef, data: Data) => void;
      delete: (ref: DocRef) => void;
    }) => Promise<T>): Promise<T> => {
      const writes: (() => Promise<void>)[] = [];
      const result = await fn({
        get: (ref) => ref.get(),
        update: (ref, data) => {
          writes.push(() => ref.update(data));
        },
        create: (ref, data) => {
          writes.push(() => ref.create(data));
        },
        set: (ref, data) => {
          writes.push(() => ref.set(data));
        },
        delete: (ref) => {
          writes.push(() => ref.delete());
        },
      });
      for (const write of writes) await write();
      return result;
    },
    collection: (name: string) => ({
      ...query(name, []),
      doc: (id: string) => ({
        id,
        get: async () => snap(id, coll(name).get(id)),
        create: async (data: Data) => {
          if (coll(name).has(id)) throw Object.assign(new Error('already exists'), { code: 6 });
          coll(name).set(id, { ...data });
        },
        set: async (data: Data) => {
          coll(name).set(id, { ...data });
        },
        update: async (data: Data) => {
          const cur = coll(name).get(id);
          if (!cur) throw Object.assign(new Error('not found'), { code: 5 });
          const next: Data = { ...cur, ...data };
          // FieldValue.delete() removes the field, as Firestore does.
          for (const [key, value] of Object.entries(data)) {
            if ((value as { methodName?: string } | null)?.methodName === 'FieldValue.delete') delete next[key];
          }
          coll(name).set(id, next);
        },
        delete: async () => {
          coll(name).delete(id);
        },
      }),
      add: async (data: Data) => {
        const id = `auto${++auto}`;
        coll(name).set(id, { ...data });
        return { id };
      },
    }),
  };
  return db;
}
