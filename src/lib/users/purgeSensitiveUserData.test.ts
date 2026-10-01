import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const collections: Record<string, Record<string, Record<string, unknown>>> = {};
  const deletedFiles: string[] = [];
  const listedPrefixes: string[] = [];
  const state = { bucketFiles: [] as string[], failList: false };

  const col = (name: string) => (collections[name] ??= {});
  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: id in col(name), data: () => col(name)[id] }),
        delete: async () => {
          delete col(name)[id];
        },
      }),
    }),
  };
  const bucket = {
    getFiles: async ({ prefix }: { prefix: string }) => {
      listedPrefixes.push(prefix);
      if (state.failList) throw new Error('storage down');
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

import { purgeSensitiveUserData } from './purgeSensitiveUserData';

beforeEach(() => {
  for (const key of Object.keys(store.collections)) delete store.collections[key];
  store.deletedFiles.length = 0;
  store.listedPrefixes.length = 0;
  store.state.failList = false;
  store.col('userSensitive').u1 = { ssnEncrypted: 'enc' };
  store.col('userSensitive').u2 = { ssnEncrypted: 'enc' };
  store.col('userOnboarding').u1_w9 = { userId: 'u1' };
  store.col('esignEnvelopes').e1 = { userId: 'u1', signedPdfPath: 'signed/u1/w9.pdf' };
  store.col('sensitiveAccessLog').log1 = { targetUid: 'u1' };
  store.state.bucketFiles = [
    'onboarding/u1/dl_photos/front.jpg',
    'onboarding/u1/llc_sos/articles.pdf',
    'onboarding/u10/dl_photos/front.jpg',
    'onboarding/invite_abc/dl_photos/front.jpg',
    'onboarding/invite_abc/dl_photos/back.jpg',
    'onboarding/invite_zzz/dl_photos/front.jpg',
  ];
});

describe('purgeSensitiveUserData', () => {
  it('removes the SSN/licence record and licence photos of that person only', async () => {
    const result = await purgeSensitiveUserData('u1');

    expect(result).toEqual({ userSensitive: 1, files: 1, failures: [] });
    expect(Object.keys(store.col('userSensitive'))).toEqual(['u2']);
    expect(store.deletedFiles).toEqual(['onboarding/u1/dl_photos/front.jpg']);
  });

  it('clears the invite folder an invited hire uploaded to, found through the item reference', async () => {
    store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference: 'onboarding/invite_abc/dl_photos/' };

    const result = await purgeSensitiveUserData('u1');

    expect(result.files).toBe(3);
    expect(store.deletedFiles.sort()).toEqual([
      'onboarding/invite_abc/dl_photos/back.jpg',
      'onboarding/invite_abc/dl_photos/front.jpg',
      'onboarding/u1/dl_photos/front.jpg',
    ]);
    expect(store.deletedFiles).not.toContain('onboarding/invite_zzz/dl_photos/front.jpg');
  });

  it('still finds a legacy reference saved without the trailing slash', async () => {
    store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference: 'onboarding/invite_abc/dl_photos' };

    await purgeSensitiveUserData('u1');

    expect(store.deletedFiles).toContain('onboarding/invite_abc/dl_photos/front.jpg');
    expect(store.deletedFiles).not.toContain('onboarding/invite_zzz/dl_photos/front.jpg');
  });

  it('ignores a reference that points at someone else\'s folder or at another item', async () => {
    store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference: 'onboarding/u10/dl_photos/' };
    await purgeSensitiveUserData('u1');
    expect(store.deletedFiles).toEqual(['onboarding/u1/dl_photos/front.jpg']);

    store.deletedFiles.length = 0;
    store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference: 'onboarding/u1/llc_sos/' };
    await purgeSensitiveUserData('u1');
    expect(store.deletedFiles).not.toContain('onboarding/u1/llc_sos/articles.pdf');
  });

  it('keeps signed paperwork, checklist history, the access log and non-identity uploads', async () => {
    await purgeSensitiveUserData('u1');

    expect(store.col('userOnboarding').u1_w9).toBeDefined();
    expect(store.col('esignEnvelopes').e1).toBeDefined();
    expect(store.col('sensitiveAccessLog').log1).toBeDefined();
    expect(store.deletedFiles).not.toContain('onboarding/u1/llc_sos/articles.pdf');
  });

  it('lists exact folders, so u1 never matches u10', async () => {
    await purgeSensitiveUserData('u1');

    expect(store.listedPrefixes).toEqual(['onboarding/u1/dl_photos/']);
    expect(store.deletedFiles).not.toContain('onboarding/u10/dl_photos/front.jpg');
  });

  it('reports a failed storage step but still removes the SSN record', async () => {
    store.state.failList = true;

    const result = await purgeSensitiveUserData('u1');

    expect(result.failures).toEqual(['dl_photos files']);
    expect(result.userSensitive).toBe(1);
  });
});
