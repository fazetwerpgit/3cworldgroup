// Firestore security rules for the owner-only tax and banking onboarding items
// (W-9, direct deposit) in userOnboarding/{uid}_{item}, plus the server-only
// collections that hold SSNs and access logs. Run against the Firestore
// EMULATOR only. Skipped unless FIRESTORE_EMULATOR_HOST is set, so the normal
// `vitest run` never needs Java or an emulator.
//
//   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v*.jar \
//     --host 127.0.0.1 --port 8187 &
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 npx vitest run src/lib/firebase/ownerTaxDocs.rules.test.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulatorHost)('firestore.rules: owner-only tax and banking documents', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = emulatorHost!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-owner-tax-docs-rules',
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
      await setDoc(doc(db, 'users/owner'), { status: 'active', role: 'owner' });
      await setDoc(doc(db, 'users/admin'), { status: 'active', role: 'admin' });
      await setDoc(doc(db, 'users/ops'), { status: 'active', role: 'operations' });
      await setDoc(doc(db, 'users/manager'), { status: 'active', fieldRole: 'l1_manager' });
      await setDoc(doc(db, 'users/rep'), { status: 'active', fieldRole: 'entry_rep' });
      await setDoc(doc(db, 'users/other'), { status: 'active', fieldRole: 'entry_rep' });
      for (const itemId of ['w9', 'direct_deposit', 'contract']) {
        await setDoc(doc(db, `userOnboarding/rep_${itemId}`), {
          userId: 'rep',
          itemId,
          status: 'approved',
          completedPdfPath: `esign-completed/rep/${itemId}.pdf`,
        });
      }
      await setDoc(doc(db, 'userSensitive/rep'), { ssnEncrypted: 'x', ssnLast4: '6789' });
      await setDoc(doc(db, 'sensitiveAccessLog/log1'), { targetUid: 'rep', revealedBy: 'owner' });
    });
  });

  const as = (uid: string) => env.authenticatedContext(uid).firestore();

  it.each(['w9', 'direct_deposit'])('lets an owner read the %s item', async (itemId) => {
    await assertSucceeds(getDoc(doc(as('owner'), `userOnboarding/rep_${itemId}`)));
  });

  it.each(['w9', 'direct_deposit'])('lets the person read their own %s item', async (itemId) => {
    await assertSucceeds(getDoc(doc(as('rep'), `userOnboarding/rep_${itemId}`)));
  });

  it.each(['admin', 'ops', 'manager', 'other'])('denies %s the W-9 and direct-deposit items', async (uid) => {
    await assertFails(getDoc(doc(as(uid), 'userOnboarding/rep_w9')));
    await assertFails(getDoc(doc(as(uid), 'userOnboarding/rep_direct_deposit')));
  });

  it('still lets an admin read a non-tax item', async () => {
    await assertSucceeds(getDoc(doc(as('admin'), 'userOnboarding/rep_contract')));
  });

  it.each(['owner', 'admin', 'rep'])('keeps userSensitive and sensitiveAccessLog server-only (%s)', async (uid) => {
    await assertFails(getDoc(doc(as(uid), 'userSensitive/rep')));
    await assertFails(getDoc(doc(as(uid), 'sensitiveAccessLog/log1')));
  });
});
