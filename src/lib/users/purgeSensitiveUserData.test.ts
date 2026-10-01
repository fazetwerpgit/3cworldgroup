import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const collections: Record<string, Record<string, Record<string, unknown>>> = {};
  const deletedFiles: string[] = [];
  const listedPrefixes: string[] = [];
  const state = { bucketFiles: [] as string[], failList: false, failInviteLookup: false };

  const col = (name: string) => (collections[name] ??= {});
  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        // Snapshot frozen at read time, like Firestore.
        get: async () => {
          const data = col(name)[id] ? { ...col(name)[id] } : undefined;
          return { exists: data !== undefined, data: () => data };
        },
        delete: async () => {
          delete col(name)[id];
        },
      }),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          if (state.failInviteLookup) throw new Error('firestore down');
          if (op !== '==') throw new Error(`unexpected op ${op}`);
          const docs = Object.entries(col(name))
            .filter(([, data]) => data[field] === value)
            .map(([id]) => ({ id }));
          return { docs };
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
          .filter((path) => path.startsWith(prefix) && !deletedFiles.includes(path))
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
  store.state.failInviteLookup = false;
  store.col('users').u1 = { displayName: 'Rep One' };
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
    'onboarding/invite_abc/llc_sos/articles.pdf',
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

  it('clears the invite folder named on the profile, even when the checklist now points at the uid folder', async () => {
    // Invited hire whose photo was rejected and re-uploaded from the portal:
    // the reference moved to the uid folder, the invite originals are unreferenced.
    store.col('users').u1 = { displayName: 'Rep One', onboardingInviteId: 'abc' };
    store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference: 'onboarding/u1/dl_photos/' };

    const result = await purgeSensitiveUserData('u1');

    expect(result.failures).toEqual([]);
    expect(store.deletedFiles.sort()).toEqual([
      'onboarding/invite_abc/dl_photos/back.jpg',
      'onboarding/invite_abc/dl_photos/front.jpg',
      'onboarding/u1/dl_photos/front.jpg',
    ]);
  });

  it('finds the invite through candidateOnboarding when the profile does not carry it', async () => {
    store.col('candidateOnboarding').abc = { convertedUserId: 'u1' };
    store.col('candidateOnboarding').zzz = { convertedUserId: 'someone-else' };

    await purgeSensitiveUserData('u1');

    expect(store.deletedFiles).toContain('onboarding/invite_abc/dl_photos/front.jpg');
    expect(store.deletedFiles).not.toContain('onboarding/invite_zzz/dl_photos/front.jpg');
  });

  it('never follows a reference to another invite, another person or another item', async () => {
    store.col('users').u1 = { displayName: 'Rep One', onboardingInviteId: 'abc' };
    for (const reference of [
      'onboarding/invite_zzz/dl_photos/',
      'onboarding/u10/dl_photos/',
      'onboarding/u1/llc_sos/',
      'onboarding/invite_abc/../invite_zzz/dl_photos/',
    ]) {
      store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference };
      await purgeSensitiveUserData('u1');
    }

    expect(store.deletedFiles).not.toContain('onboarding/invite_zzz/dl_photos/front.jpg');
    expect(store.deletedFiles).not.toContain('onboarding/u10/dl_photos/front.jpg');
    expect(store.deletedFiles).not.toContain('onboarding/u1/llc_sos/articles.pdf');
    expect(store.deletedFiles).not.toContain('onboarding/invite_abc/llc_sos/articles.pdf');
  });

  it('ignores an invite id that is not a single safe path segment', async () => {
    store.col('users').u1 = { displayName: 'Rep One', onboardingInviteId: 'abc/../zzz' };

    await purgeSensitiveUserData('u1');

    expect(store.listedPrefixes).toEqual(['onboarding/u1/dl_photos/']);
  });

  it('accepts a legacy reference saved without the trailing slash when it is the person\'s own folder', async () => {
    store.col('users').u1 = { displayName: 'Rep One', onboardingInviteId: 'abc' };
    store.col('userOnboarding').u1_dl_photos = { userId: 'u1', reference: 'onboarding/invite_abc/dl_photos' };

    const result = await purgeSensitiveUserData('u1');

    expect(result.failures).toEqual([]);
    expect(store.deletedFiles).toContain('onboarding/invite_abc/dl_photos/front.jpg');
  });

  it('keeps signed paperwork, checklist history, the access log and non-identity uploads', async () => {
    store.col('users').u1 = { displayName: 'Rep One', onboardingInviteId: 'abc' };

    await purgeSensitiveUserData('u1');

    expect(store.col('userOnboarding').u1_w9).toBeDefined();
    expect(store.col('esignEnvelopes').e1).toBeDefined();
    expect(store.col('sensitiveAccessLog').log1).toBeDefined();
    expect(store.deletedFiles).not.toContain('onboarding/u1/llc_sos/articles.pdf');
    expect(store.deletedFiles).not.toContain('onboarding/invite_abc/llc_sos/articles.pdf');
  });

  it('reports a failed invite lookup, so the caller keeps the profile and can retry', async () => {
    store.state.failInviteLookup = true;

    const result = await purgeSensitiveUserData('u1');

    expect(result.failures).toEqual(['invite lookup']);
    expect(result.userSensitive).toBe(1);
  });

  it('reports a failed storage step but still removes the SSN record', async () => {
    store.state.failList = true;

    const result = await purgeSensitiveUserData('u1');

    expect(result.failures).toEqual(['dl_photos files']);
    expect(result.userSensitive).toBe(1);
  });

  it('is safe to run again after a partial failure', async () => {
    store.state.failList = true;
    await purgeSensitiveUserData('u1');
    store.state.failList = false;

    const retry = await purgeSensitiveUserData('u1');

    expect(retry).toEqual({ userSensitive: 0, files: 1, failures: [] });
    expect(store.deletedFiles).toEqual(['onboarding/u1/dl_photos/front.jpg']);
  });
});
