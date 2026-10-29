import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-cwg';
const [EMULATOR_HOST, EMULATOR_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8099'
).split(':');

const campaign = {
  name: 'Fiber',
  type: 'fiber',
  dispositions: ['sold'],
  carrier: 'T-Fiber',
  quickPicks: [],
  access: 'open',
  updatedAt: 1,
  updatedBy: 'owner',
};

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host: EMULATOR_HOST,
      port: Number(EMULATOR_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/owner'), {
        email: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner',
        status: 'active',
      }),
      setDoc(doc(db, 'users/owner2'), {
        email: 'owner2@example.com',
        displayName: 'Owner Two',
        role: 'owner',
        status: 'active',
      }),
      setDoc(doc(db, 'users/rep'), {
        email: 'rep@example.com',
        displayName: 'Rep',
        fieldRole: 'entry_level_rep',
        status: 'active',
      }),
      setDoc(doc(db, 'users/other'), {
        email: 'other@example.com',
        displayName: 'Other',
        fieldRole: 'entry_level_rep',
        status: 'active',
      }),
      setDoc(doc(db, 'users/tester'), {
        email: 'tester@example.com',
        displayName: 'Test Rep',
        fieldRole: 'entry_level_rep',
        status: 'active',
        testAccount: true,
      }),
      setDoc(doc(db, 'campaigns/c1'), campaign),
      setDoc(doc(db, 'config/app'), {
        minBuild: { ios: 19, android: 1 },
        storeUrl: {
          ios: 'https://apps.apple.com/app/id6823817669',
          android: 'https://play.google.com/store/apps/details?id=com.chompen.app',
        },
      }),
      setDoc(doc(db, 'config/fiberRepMap'), { reps: { a: 'b' } }),
      setDoc(doc(db, 'sales/s1'), {
        salesRepId: 'rep',
        status: 'approved',
        totalPoints: 10,
        saleDate: new Date(),
      }),
      setDoc(doc(db, 'training/t1'), { title: 'Training' }),
      setDoc(doc(db, 'chatChannels/team'), {
        name: 'Team',
        active: true,
        audience: 'all',
        memberIds: ['rep'],
      }),
      setDoc(doc(db, 'chatChannels/team/messages/m1'), {
        text: 'hello',
        senderId: 'rep',
      }),
      setDoc(doc(db, 'userOnboarding/o1'), { userId: 'rep', status: 'approved' }),
    ]);
  });
});

const ownerDb = () => testEnv.authenticatedContext('owner', { email: 'owner@example.com' }).firestore();
const owner2Db = () => testEnv.authenticatedContext('owner2', { email: 'owner2@example.com' }).firestore();
const repDb = () => testEnv.authenticatedContext('rep', { email: 'rep@example.com' }).firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

describe('Chompen store update gate (config/app)', () => {
  it('allows an unauthenticated get of config/app and returns the data', async () => {
    const snap = await assertSucceeds(getDoc(doc(anonDb(), 'config/app')));
    expect(snap.exists()).toBe(true);
    expect(snap.data()).toMatchObject({
      minBuild: { ios: 19, android: 1 },
      storeUrl: {
        ios: 'https://apps.apple.com/app/id6823817669',
        android: 'https://play.google.com/store/apps/details?id=com.chompen.app',
      },
    });
  });

  it('denies listing the config collection', async () => {
    await assertFails(getDocs(collection(anonDb(), 'config')));
  });

  it('denies unauthenticated writes to config/app', async () => {
    await assertFails(
      setDoc(doc(anonDb(), 'config/app'), { minBuild: { ios: 1, android: 1 } })
    );
  });

  it('denies client writes to config/app even for an owner', async () => {
    await assertFails(
      updateDoc(doc(ownerDb(), 'config/app'), {
        storeUrl: { ios: 'https://example.com', android: 'https://example.com' },
      })
    );
  });

  it('keeps config/fiberRepMap denied', async () => {
    await assertFails(getDoc(doc(anonDb(), 'config/fiberRepMap')));
    await assertFails(getDoc(doc(ownerDb(), 'config/fiberRepMap')));
  });

  it('denies config docs other than app', async () => {
    await assertFails(getDoc(doc(anonDb(), 'config/other')));
  });
});

describe('Campaign soft delete (archive)', () => {
  const archivePayload = () => ({
    archived: true,
    archivedAt: 1_790_000_000_000,
    archivedBy: 'owner',
    updatedAt: 1_790_000_000_000,
    updatedBy: 'owner',
  });

  it('allows an owner client update that archives the campaign', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'campaigns/c1'), archivePayload()));
    const snap = await assertSucceeds(getDoc(doc(ownerDb(), 'campaigns/c1')));
    expect(snap.data()).toMatchObject({ archived: true, archivedBy: 'owner' });
  });

  it('refuses a non-owner archive', async () => {
    await assertFails(
      updateDoc(doc(repDb(), 'campaigns/c1'), {
        ...archivePayload(),
        updatedBy: 'rep',
        archivedBy: 'rep',
      })
    );
  });

  it('refuses a client delete', async () => {
    await assertFails(deleteDoc(doc(ownerDb(), 'campaigns/c1')));
  });

  it('refuses un-archiving from a client', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'campaigns/c1'), archivePayload()));
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        archived: false,
        updatedAt: 1_790_000_000_001,
        updatedBy: 'owner',
      })
    );
  });

  it('refuses un-archiving by deleting the archived field', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'campaigns/c1'), archivePayload()));
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        archived: deleteField(),
        updatedAt: 1_790_000_000_001,
        updatedBy: 'owner',
      })
    );
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        archived: deleteField(),
        archivedAt: deleteField(),
        archivedBy: deleteField(),
        updatedAt: 1_790_000_000_001,
        updatedBy: 'owner',
      })
    );
  });

  it('refuses changing archivedBy or archivedAt after archive', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'campaigns/c1'), archivePayload()));
    await assertFails(
      updateDoc(doc(owner2Db(), 'campaigns/c1'), {
        archivedBy: 'owner2',
        archivedAt: 1_790_000_000_002,
        updatedAt: 1_790_000_000_002,
        updatedBy: 'owner2',
      })
    );
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        archivedAt: 1_790_000_000_002,
        updatedAt: 1_790_000_000_002,
        updatedBy: 'owner',
      })
    );
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        archivedAt: deleteField(),
        updatedAt: 1_790_000_000_002,
        updatedBy: 'owner',
      })
    );
  });

  it('still allows a non-archive edit of an archived campaign, by any owner', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'campaigns/c1'), archivePayload()));
    await assertSucceeds(
      updateDoc(doc(owner2Db(), 'campaigns/c1'), {
        name: 'Fiber (old)',
        updatedAt: 1_790_000_000_003,
        updatedBy: 'owner2',
      })
    );
    const snap = await getDoc(doc(ownerDb(), 'campaigns/c1'));
    expect(snap.data()).toMatchObject({ name: 'Fiber (old)', archived: true, archivedBy: 'owner' });
  });

  it('allows re-archiving a campaign the Admin SDK restored', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'campaigns/c1'), {
        archived: false,
        archivedAt: 1_780_000_000_000,
        archivedBy: 'owner',
      });
    });
    // A restored campaign stays editable without touching the stamp.
    await assertSucceeds(
      updateDoc(doc(owner2Db(), 'campaigns/c1'), {
        name: 'Fiber restored',
        updatedAt: 1_790_000_000_004,
        updatedBy: 'owner2',
      })
    );
    await assertSucceeds(
      updateDoc(doc(owner2Db(), 'campaigns/c1'), {
        archived: true,
        archivedAt: 1_790_000_000_005,
        archivedBy: 'owner2',
        updatedAt: 1_790_000_000_005,
        updatedBy: 'owner2',
      })
    );
  });

  it('refuses touching the stamp of a non-archived campaign without archiving it', async () => {
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        archived: false,
        archivedAt: 1_790_000_000_006,
        archivedBy: 'owner',
        updatedAt: 1_790_000_000_006,
        updatedBy: 'owner',
      })
    );
  });

  it('refuses an archive stamped with another user id', async () => {
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        ...archivePayload(),
        archivedBy: 'rep',
      })
    );
  });

  it('refuses a non-numeric archivedAt', async () => {
    await assertFails(
      updateDoc(doc(ownerDb(), 'campaigns/c1'), {
        ...archivePayload(),
        archivedAt: 'yesterday',
      })
    );
  });
});

describe('Self-signup profile create', () => {
  const pending = (email: string) => ({ email, displayName: 'New Hire', status: 'pending', createdAt: serverTimestamp() });
  const signedIn = (uid: string, email: string, provider: 'password' | 'apple.com' | 'google.com') =>
    testEnv.authenticatedContext(uid, { email, firebase: { sign_in_provider: provider } }).firestore();

  it('lets a password signup create its own pending profile', async () => {
    await assertSucceeds(setDoc(doc(signedIn('new-pw', 'new@example.com', 'password'), 'users/new-pw'), pending('new@example.com')));
  });

  it.each(['apple.com', 'google.com'] as const)('refuses a profile from a %s sign-in', async (provider) => {
    await assertFails(
      setDoc(doc(signedIn('new-social', 'x@privaterelay.appleid.com', provider), 'users/new-social'), pending('x@privaterelay.appleid.com'))
    );
  });
});

describe('Existing portal rules still hold', () => {
  it('lets a user read their own profile but not another user', async () => {
    await assertSucceeds(getDoc(doc(repDb(), 'users/rep')));
    await assertFails(getDoc(doc(repDb(), 'users/other')));
  });

  it('keeps sales and training server-only', async () => {
    await assertFails(getDoc(doc(repDb(), 'sales/s1')));
    await assertFails(getDoc(doc(repDb(), 'training/t1')));
    await assertFails(
      setDoc(doc(repDb(), 'sales/s2'), { salesRepId: 'rep', totalPoints: 99999 })
    );
  });

  it('allows a chat member to read the channel and its messages, and nobody else', async () => {
    await assertSucceeds(getDoc(doc(repDb(), 'chatChannels/team')));
    await assertSucceeds(getDoc(doc(repDb(), 'chatChannels/team/messages/m1')));
    await assertFails(getDoc(doc(ownerDb(), 'chatChannels/team')));
    await assertFails(getDoc(doc(ownerDb(), 'chatChannels/team/messages/m1')));
  });

  it('keeps chat reads self-only and server-timestamped', async () => {
    await assertSucceeds(
      setDoc(doc(repDb(), 'users/rep/chatReads/team'), { lastReadAt: serverTimestamp() })
    );
    await assertFails(
      setDoc(doc(repDb(), 'users/other/chatReads/team'), { lastReadAt: serverTimestamp() })
    );
  });

  it('keeps onboarding progress read-only for its owner', async () => {
    await assertSucceeds(getDoc(doc(repDb(), 'userOnboarding/o1')));
    await assertFails(
      setDoc(doc(repDb(), 'userOnboarding/o2'), { userId: 'rep', status: 'approved' })
    );
  });
});

// users/{uid}.recruiter is the hidden recruiting grant (isRecruiter in
// src/types/auth.ts). Only the Admin SDK may write it (scripts/set-recruiter.mjs);
// no client, the user's own included, may set, change or clear it.
describe('Hidden recruiter grant', () => {
  const recruiterDb = () => testEnv.authenticatedContext('mason', { email: 'mason@example.com' }).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, 'users/mason'), {
          email: 'mason@example.com',
          displayName: 'Mason',
          fieldRole: 'general_manager',
          status: 'active',
          recruiter: true,
        }),
        setDoc(doc(db, 'users/teamrep'), {
          email: 'teamrep@example.com',
          displayName: 'Team Rep',
          fieldRole: 'entry_level_rep',
          status: 'active',
          managerId: 'rep',
          campaignIds: [],
        }),
        setDoc(doc(db, 'userOnboarding/o3'), { userId: 'other', itemId: 'dl_photos', status: 'submitted' }),
      ]);
    });
  });

  it('refuses a self-signup that sets recruiter on create', async () => {
    const db = testEnv
      .authenticatedContext('new-r', { email: 'newr@example.com', firebase: { sign_in_provider: 'password' } })
      .firestore();
    await assertFails(
      setDoc(doc(db, 'users/new-r'), {
        email: 'newr@example.com',
        displayName: 'New',
        status: 'pending',
        createdAt: serverTimestamp(),
        recruiter: true,
      })
    );
  });

  it('refuses a user setting recruiter on their own profile, alone or with an allowed key', async () => {
    await assertFails(updateDoc(doc(repDb(), 'users/rep'), { recruiter: true }));
    await assertFails(updateDoc(doc(repDb(), 'users/rep'), { campaignNoticeAckAt: 1, recruiter: true }));
    await assertFails(updateDoc(doc(repDb(), 'users/rep'), { activeCampaignId: null, recruiter: true }));
    await assertFails(setDoc(doc(repDb(), 'users/rep'), { recruiter: true }, { merge: true }));
  });

  it('refuses a recruiter changing or clearing their own grant', async () => {
    await assertFails(updateDoc(doc(recruiterDb(), 'users/mason'), { recruiter: false }));
    await assertFails(updateDoc(doc(recruiterDb(), 'users/mason'), { recruiter: deleteField() }));
  });

  it('refuses a manager or an owner setting recruiter on someone else', async () => {
    await assertFails(updateDoc(doc(repDb(), 'users/teamrep'), { recruiter: true }));
    await assertFails(updateDoc(doc(ownerDb(), 'users/rep'), { recruiter: true }));
  });

  it('grants a recruiter no client read of other users or their onboarding (recruiting reads go through the APIs)', async () => {
    await assertSucceeds(getDoc(doc(recruiterDb(), 'users/mason')));
    await assertFails(getDoc(doc(recruiterDb(), 'users/other')));
    await assertFails(getDoc(doc(recruiterDb(), 'userOnboarding/o3')));
  });
});
