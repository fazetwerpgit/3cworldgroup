// TEST-ONLY in-memory stand-in for the slice of Firestore the lead-list routes touch
// (collection get / where '==' / doc get, getAll, batch create + commit). Imported by tests
// only; nothing in the app imports it. A batch create of an existing doc fails the whole
// commit with ALREADY_EXISTS (code 6), as Firestore does.

type DocData = Record<string, unknown>;

export interface FakeLeadDb {
  db: FirebaseFirestore.Firestore;
  /** Doc ids written by each committed batch, in order. */
  commits: string[][];
  docs: (collection: string) => Map<string, DocData>;
  /** Runs once, right before the next batch commit applies (simulates a concurrent writer). */
  beforeNextCommit: (() => void) | null;
  /** The commit attempt (1-based) that fails with UNAVAILABLE, writing nothing; null = none. */
  failCommit: number | null;
}

export function createFakeLeadDb(seed: Record<string, Record<string, DocData>> = {}): FakeLeadDb {
  const store = new Map<string, Map<string, DocData>>();
  for (const [name, docs] of Object.entries(seed)) {
    store.set(name, new Map(Object.entries(docs).map(([id, data]) => [id, structuredClone(data)])));
  }
  const table = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const snap = (id: string, data: DocData | undefined) => ({
    id,
    exists: data !== undefined,
    data: () => (data ? structuredClone(data) : undefined),
  });
  const docs = (name: string, filter?: (data: DocData) => boolean) => async () => ({
    docs: [...table(name).entries()].filter(([, data]) => !filter || filter(data)).map(([id, data]) => snap(id, data)),
  });
  interface Ref {
    id: string;
    name: string;
    get: () => Promise<ReturnType<typeof snap>>;
  }
  const docRef = (name: string, id: string): Ref => ({
    id,
    name,
    get: async () => snap(id, table(name).get(id)),
  });

  let attempts = 0;
  const fake: FakeLeadDb = {
    db: null as unknown as FirebaseFirestore.Firestore,
    commits: [],
    docs: table,
    beforeNextCommit: null,
    failCommit: null,
  };
  const db = {
    collection: (name: string) => ({
      get: docs(name),
      where: (field: string, op: string, value: unknown) => {
        if (op !== '==') throw new Error(`fakeLeadDb: unsupported op ${op}`);
        return { get: docs(name, (data) => data[field] === value) };
      },
      doc: (id: string) => docRef(name, id),
    }),
    getAll: async (...refs: Ref[]) => refs.map((ref) => snap(ref.id, table(ref.name).get(ref.id))),
    batch: () => {
      const creates: { ref: Ref; data: DocData }[] = [];
      return {
        create: (ref: Ref, data: DocData) => {
          creates.push({ ref, data: structuredClone(data) });
        },
        commit: async () => {
          if (++attempts === fake.failCommit) throw Object.assign(new Error('14 UNAVAILABLE'), { code: 14 });
          const hook = fake.beforeNextCommit;
          fake.beforeNextCommit = null;
          hook?.();
          if (creates.some(({ ref }) => table(ref.name).has(ref.id))) {
            throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
          }
          for (const { ref, data } of creates) table(ref.name).set(ref.id, data);
          fake.commits.push(creates.map(({ ref }) => ref.id));
        },
      };
    },
  };
  fake.db = db as unknown as FirebaseFirestore.Firestore;
  return fake;
}
