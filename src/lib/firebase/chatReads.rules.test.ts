// Firestore security rules for users/{uid}/chatReads/{channelId}, run against the
// Firestore EMULATOR only. Skipped unless FIRESTORE_EMULATOR_HOST is set, so the
// normal `vitest run` never needs Java or an emulator.
//
//   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v*.jar \
//     --host 127.0.0.1 --port 8187 &
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 npx vitest run src/lib/firebase/chatReads.rules.test.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulatorHost)('firestore.rules: chatReads receipts', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = emulatorHost!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-chatreads-rules',
      firestore: {
        host,
        port: Number(port),
        rules: readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/alice'), { status: 'active' });
      await setDoc(doc(db, 'users/bob'), { status: 'active' });
      await setDoc(doc(db, 'users/hire'), { status: 'pending', fieldRole: 'entry_rep' });
      await setDoc(doc(db, 'users/bob/chatReads/general'), { lastReadAt: Timestamp.now() });
      await setDoc(doc(db, 'users/alice/chatReads/existing'), { lastReadAt: Timestamp.now() });
    });
  });

  const asUser = (uid: string) => env.authenticatedContext(uid).firestore();

  it('allows writing your own receipt with serverTimestamp()', async () => {
    await assertSucceeds(
      setDoc(doc(asUser('alice'), 'users/alice/chatReads/general'), { lastReadAt: serverTimestamp() })
    );
  });

  it('allows refreshing an existing receipt with serverTimestamp()', async () => {
    await assertSucceeds(
      setDoc(doc(asUser('alice'), 'users/alice/chatReads/existing'), { lastReadAt: serverTimestamp() })
    );
  });

  it('allows an onboarding member to write their own receipt with serverTimestamp()', async () => {
    await assertSucceeds(
      setDoc(doc(asUser('hire'), 'users/hire/chatReads/general'), { lastReadAt: serverTimestamp() })
    );
  });

  it('denies a client-chosen future time', async () => {
    const future = Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await assertFails(
      setDoc(doc(asUser('alice'), 'users/alice/chatReads/general'), { lastReadAt: future })
    );
  });

  it('denies a client-chosen past time', async () => {
    const past = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
    await assertFails(
      setDoc(doc(asUser('alice'), 'users/alice/chatReads/existing'), { lastReadAt: past })
    );
  });

  it("denies writing another user's receipt", async () => {
    await assertFails(
      setDoc(doc(asUser('alice'), 'users/bob/chatReads/general'), { lastReadAt: serverTimestamp() })
    );
  });

  it('denies extra keys', async () => {
    await assertFails(
      setDoc(doc(asUser('alice'), 'users/alice/chatReads/general'), {
        lastReadAt: serverTimestamp(),
        extra: true,
      })
    );
  });

  it('denies deleting a receipt', async () => {
    await assertFails(deleteDoc(doc(asUser('alice'), 'users/alice/chatReads/existing')));
  });

  it('allows reading your own receipt', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'users/alice/chatReads/existing')));
  });

  it("denies reading another user's receipt", async () => {
    await assertFails(getDoc(doc(asUser('alice'), 'users/bob/chatReads/general')));
  });

  it('denies unauthenticated writes', async () => {
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/chatReads/general'), {
        lastReadAt: serverTimestamp(),
      })
    );
  });
});
