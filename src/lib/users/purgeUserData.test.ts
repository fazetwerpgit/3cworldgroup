import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { id: string; data: Record<string, unknown> };

const store = vi.hoisted(() => {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const deletedFiles: string[] = [];
  const listedPrefixes: string[] = [];
  const state = { bucketFiles: [] as string[], failFileDelete: new Set<string>(), failCollection: '' };

  const col = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  };
  const docRef = (name: string, id: string) => ({
    id,
    get: async () => ({ exists: col(name).has(id), get: (f: string) => col(name).get(id)?.[f] }),
    delete: async () => {
      col(name).delete(id);
    },
  });
  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(name, id),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => {
          if (state.failCollection === name) throw new Error(`${name} down`);
          const docs = [...col(name).entries()]
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => ({ id, ref: docRef(name, id), get: (f: string) => data[f] }));
          return { docs, size: docs.length };
        },
      }),
    }),
    batch: () => {
      const refs: Array<{ delete: () => Promise<void> }> = [];
      return {
        delete: (ref: { delete: () => Promise<void> }) => refs.push(ref),
        commit: async () => {
          await Promise.all(refs.map((ref) => ref.delete()));
        },
      };
    },
  };
  const bucket = {
    file: (path: string) => ({
      delete: async () => {
        if (state.failFileDelete.has(path)) throw new Error('storage down');
        deletedFiles.push(path);
      },
    }),
    getFiles: async ({ prefix }: { prefix: string }) => {
      listedPrefixes.push(prefix);
      return [
        state.bucketFiles
          .filter((path) => path.startsWith(prefix))
          .map((path) => ({ delete: async () => void deletedFiles.push(path) })),
      ];
    },
  };
  return { adminDb, bucket, collections, col, deletedFiles, listedPrefixes, state };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: store.adminDb,
  getOnboardingBucket: () => store.bucket,
}));

import { purgeUserData } from './purgeUserData';

function seed(name: string, docs: Doc[]) {
  docs.forEach((d) => store.col(name).set(d.id, d.data));
}

beforeEach(() => {
  store.collections.clear();
  store.deletedFiles.length = 0;
  store.listedPrefixes.length = 0;
  store.state.bucketFiles = [];
  store.state.failFileDelete.clear();
  store.state.failCollection = '';
  seed('userSensitive', [{ id: 'u1', data: { ssn: 'enc' } }, { id: 'u2', data: { ssn: 'enc' } }]);
  seed('userOnboarding', [
    { id: 'u1_w9', data: { userId: 'u1' } },
    { id: 'u1_dl_photos', data: { userId: 'u1' } },
    { id: 'u2_w9', data: { userId: 'u2' } },
  ]);
  seed('esignEnvelopes', [
    { id: 'e1', data: { userId: 'u1', signedPdfPath: 'signed/u1/w9.pdf' } },
    { id: 'e2', data: { userId: 'u2', signedPdfPath: 'signed/u2/w9.pdf' } },
  ]);
  seed('sensitiveAccessLog', [{ id: 'log1', data: { targetUid: 'u1' } }]);
  store.state.bucketFiles = ['onboarding/u1/dl_photos/front.jpg', 'onboarding/u10/dl_photos/front.jpg'];
});

describe('purgeUserData', () => {
  it('removes only the deleted person\'s sensitive records, signed PDFs and uploads', async () => {
    const result = await purgeUserData('u1');

    expect(result).toEqual({ userSensitive: 1, onboardingItems: 2, envelopes: 1, files: 2, failures: [] });
    expect([...store.col('userSensitive').keys()]).toEqual(['u2']);
    expect([...store.col('userOnboarding').keys()]).toEqual(['u2_w9']);
    expect([...store.col('esignEnvelopes').keys()]).toEqual(['e2']);
    expect(store.deletedFiles.sort()).toEqual(['onboarding/u1/dl_photos/front.jpg', 'signed/u1/w9.pdf']);
  });

  it('lists uploads by exact folder so u1 never matches u10', async () => {
    await purgeUserData('u1');

    expect(store.listedPrefixes).toEqual(['onboarding/u1/']);
    expect(store.deletedFiles).not.toContain('onboarding/u10/dl_photos/front.jpg');
  });

  it('keeps the access log: it records who viewed the data, not the data', async () => {
    await purgeUserData('u1');

    expect(store.col('sensitiveAccessLog').has('log1')).toBe(true);
  });

  it('reports a failed step and keeps going instead of throwing', async () => {
    store.state.failCollection = 'userOnboarding';

    const result = await purgeUserData('u1');

    expect(result.failures).toEqual(['userOnboarding']);
    expect(result.userSensitive).toBe(1);
    expect(store.col('userOnboarding').has('u1_w9')).toBe(true);
    expect(store.col('esignEnvelopes').has('e1')).toBe(false);
  });

  it('keeps an envelope whose signed PDF could not be deleted, so the path stays traceable', async () => {
    store.state.failFileDelete.add('signed/u1/w9.pdf');

    const result = await purgeUserData('u1');

    expect(result.failures).toEqual(['signed PDF signed/u1/w9.pdf']);
    expect(store.col('esignEnvelopes').has('e1')).toBe(true);
  });
});
