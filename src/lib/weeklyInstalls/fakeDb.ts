// TEST-ONLY in-memory stand-in for the slice of Firestore the weekly installs
// email and the install reminders touch (collection/doc/where/get/create/set/
// update, runTransaction). Imported by tests only; nothing in the app imports
// it. Records every write so a test can assert that
// a code path wrote nothing at all.

type DocData = Record<string, unknown>;

export interface FakeWrite {
  op: 'create' | 'set' | 'update';
  collection: string;
  id: string;
  data: DocData;
}

export interface FakeDb {
  db: FirebaseFirestore.Firestore;
  writes: FakeWrite[];
  docs: (collection: string) => Map<string, DocData>;
}

export function createFakeDb(seed: Record<string, Record<string, DocData>> = {}): FakeDb {
  const store = new Map<string, Map<string, DocData>>();
  const writes: FakeWrite[] = [];
  for (const [name, docs] of Object.entries(seed)) {
    store.set(name, new Map(Object.entries(docs).map(([id, data]) => [id, { ...data }])));
  }
  const table = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const snap = (id: string, data: DocData | undefined) => ({
    id,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
    get: (field: string) => data?.[field],
  });
  const query = (name: string, filter?: (data: DocData) => boolean) => ({
    get: async () => ({
      docs: [...table(name).entries()]
        .filter(([, data]) => !filter || filter(data))
        .map(([id, data]) => snap(id, data)),
    }),
  });

  const docRef = (name: string, id: string) => ({
    id,
    get: async () => snap(id, table(name).get(id)),
    create: async (data: DocData) => {
      if (table(name).has(id)) {
        throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      }
      table(name).set(id, { ...data });
      writes.push({ op: 'create', collection: name, id, data });
    },
    set: async (data: DocData, options?: { merge?: boolean }) => {
      const current = options?.merge ? table(name).get(id) ?? {} : {};
      table(name).set(id, { ...current, ...data });
      writes.push({ op: 'set', collection: name, id, data });
    },
    update: async (data: DocData) => {
      const current = table(name).get(id);
      if (!current) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
      table(name).set(id, { ...current, ...data });
      writes.push({ op: 'update', collection: name, id, data });
    },
  });

  const db = {
    collection: (name: string) => ({
      ...query(name),
      where: (field: string, op: string, value: unknown) => {
        if (op !== '==') throw new Error(`fakeDb: unsupported op ${op}`);
        return query(name, (data) => data[field] === value);
      },
      doc: (id: string) => docRef(name, id),
    }),
    // Reads go straight through; writes apply when the body resolves, as a
    // committed transaction's do.
    runTransaction: async <T>(body: (transaction: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => Promise<void>> = [];
      const result = await body({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        update: (ref: { update: (data: DocData) => Promise<void> }, data: DocData) => {
          pending.push(() => ref.update(data));
        },
      });
      for (const write of pending) await write();
      return result;
    },
  };

  return { db: db as unknown as FirebaseFirestore.Firestore, writes, docs: table };
}
