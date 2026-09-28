// TEST-ONLY in-memory stand-in for the slice of Firestore Ask 3C touches
// (collection get/add, where '=='/'in', orderBy, limit, doc get/set/update,
// runTransaction with get/set). Collections listed in `failing` reject every
// read, to test fail-soft paths.
// Imported by tests only; nothing in the app imports it.

type DocData = Record<string, unknown>;

type Filter = { field: string; op: string; value: unknown };
type Order = { field: string; dir: 'asc' | 'desc' };

function sortKey(value: unknown): number | string {
  if (value instanceof Date) return value.getTime();
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (stamp && typeof stamp.toDate === 'function') return stamp.toDate().getTime();
  return typeof value === 'number' || typeof value === 'string' ? value : '';
}

export function createFakeAskDb(seed: Record<string, Record<string, DocData>> = {}, failing: string[] = []) {
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
    get: async () => {
      if (failing.includes(name)) throw new Error(`fake read failure: ${name}`);
      return snap(id, table(name).get(id));
    },
    set: async (data: DocData) => {
      table(name).set(id, { ...data });
    },
    update: async (data: DocData) => {
      const current = table(name).get(id);
      if (!current) throw new Error('NOT_FOUND');
      table(name).set(id, { ...current, ...data });
    },
  });

  type Shape = { filters: Filter[]; order: Order | null; max: number | null; fields: string[] | null };
  const matches = (data: DocData, { field, op, value }: Filter) => {
    if (op === 'in') return (value as unknown[]).includes(data[field]);
    if (op === '==') return data[field] === value;
    if (op === '>=') return data[field] !== undefined && sortKey(data[field]) >= sortKey(value);
    return false;
  };
  const query = (name: string, shape: Shape): Record<string, unknown> => ({
    where: (field: string, op: string, value: unknown) =>
      query(name, { ...shape, filters: [...shape.filters, { field, op, value }] }),
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => query(name, { ...shape, order: { field, dir } }),
    limit: (n: number) => query(name, { ...shape, max: n }),
    select: (...fields: string[]) => query(name, { ...shape, fields }),
    get: async () => {
      if (failing.includes(name)) throw new Error(`fake read failure: ${name}`);
      const { filters, order, max, fields } = shape;
      let rows = [...table(name).entries()].filter(([, data]) => filters.every((filter) => matches(data, filter)));
      if (order) {
        rows = rows
          .filter(([, data]) => data[order.field] !== undefined)
          .sort(([, a], [, b]) => {
            const [x, y] = [sortKey(a[order.field]), sortKey(b[order.field])];
            return (x < y ? -1 : x > y ? 1 : 0) * (order.dir === 'desc' ? -1 : 1);
          });
      }
      if (max !== null) rows = rows.slice(0, max);
      const docs = rows.map(([id, data]) =>
        snap(id, fields ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) : data)
      );
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });

  const db = {
    collection: (name: string) => ({
      ...query(name, { filters: [], order: null, max: null, fields: null }),
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
