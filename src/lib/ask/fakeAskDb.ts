// TEST-ONLY in-memory stand-in for the slice of Firestore Ask 3C touches
// (collection get/add, doc get/set/update, runTransaction with get/set).
// Imported by tests only; nothing in the app imports it.

type DocData = Record<string, unknown>;

export function createFakeAskDb(seed: Record<string, Record<string, DocData>> = {}) {
  const store = new Map<string, Map<string, DocData>>();
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
  let autoId = 0;
  const docRef = (name: string, id: string) => ({
    id,
    get: async () => snap(id, table(name).get(id)),
    set: async (data: DocData) => {
      table(name).set(id, { ...data });
    },
    update: async (data: DocData) => {
      const current = table(name).get(id);
      if (!current) throw new Error('NOT_FOUND');
      table(name).set(id, { ...current, ...data });
    },
  });

  const db = {
    collection: (name: string) => ({
      get: async () => ({ docs: [...table(name).entries()].map(([id, data]) => snap(id, data)) }),
      doc: (id: string) => docRef(name, id),
      add: async (data: DocData) => {
        autoId += 1;
        const id = `log${autoId}`;
        table(name).set(id, { ...data });
        return { id };
      },
    }),
    runTransaction: async <T>(body: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => Promise<void>> = [];
      const result = await body({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { set: (data: DocData) => Promise<void> }, data: DocData) => {
          pending.push(() => ref.set(data));
        },
      });
      for (const write of pending) await write();
      return result;
    },
  };
  return { db, docs: table };
}
