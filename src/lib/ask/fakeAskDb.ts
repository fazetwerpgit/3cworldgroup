// TEST-ONLY in-memory stand-in for the slice of Firestore Ask 3C touches
// (collection get/add, doc get/set/update/delete, where ==/>=/<= + orderBy +
// limit queries, runTransaction with get/set/update).
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
    delete: async () => {
      table(name).delete(id);
    },
  });

  // Dates compare by time; everything else as is.
  const value = (v: unknown) => (v instanceof Date ? v.getTime() : v) as number | string;
  type Filter = (data: DocData) => boolean;
  const query = (name: string, filters: Filter[], order: { field: string; dir: 'asc' | 'desc' } | null, max: number | null) => ({
    where: (field: string, op: '==' | '>=' | '<=', target: unknown) =>
      query(
        name,
        [
          ...filters,
          (data: DocData) =>
            op === '==' ? data[field] === target : op === '>=' ? value(data[field]) >= value(target) : value(data[field]) <= value(target),
        ],
        order,
        max
      ),
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => query(name, filters, { field, dir }, max),
    limit: (n: number) => query(name, filters, order, n),
    get: async () => {
      let rows = [...table(name).entries()].filter(([, data]) => filters.every((filter) => filter(data)));
      if (order) {
        rows = rows.sort(([, a], [, b]) => {
          const [x, y] = [value(a[order.field]), value(b[order.field])];
          return (x < y ? -1 : x > y ? 1 : 0) * (order.dir === 'desc' ? -1 : 1);
        });
      }
      if (max !== null) rows = rows.slice(0, max);
      return { docs: rows.map(([id, data]) => snap(id, data)), size: rows.length };
    },
  });

  const db = {
    collection: (name: string) => ({
      ...query(name, [], null, null),
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
        update: (ref: { update: (data: DocData) => Promise<void> }, data: DocData) => {
          pending.push(() => ref.update(data));
        },
      });
      for (const write of pending) await write();
      return result;
    },
  };
  return { db, docs: table };
}
