// Firestore security rules for houses/{houseId}: the manager's soft Delete door / Undo
// (3c-knock docs/design/DELETE_DOORS.md), run against the Firestore EMULATOR only. Skipped unless
// FIRESTORE_EMULATOR_HOST is set, so the normal `vitest run` never needs Java or an emulator.
//
//   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v*.jar \
//     --host 127.0.0.1 --port 8187 &
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 npx vitest run src/lib/firebase/houses.rules.test.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

const CAMPAIGN = 'fiber-1';
const AT = 1_760_000_000_000;

describe.skipIf(!emulatorHost)('firestore.rules: houses soft delete', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = emulatorHost!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-houses-rules',
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
      await setDoc(doc(db, 'users/rep'), { status: 'active', role: 'user', managerId: 'mgr', campaignIds: [CAMPAIGN] });
      await setDoc(doc(db, 'users/mgr'), { status: 'active', role: 'user', fieldRole: 'l1_manager', campaignIds: [CAMPAIGN] });
      await setDoc(doc(db, 'users/mgr2'), { status: 'active', role: 'user', fieldRole: 'l2_manager', campaignIds: [CAMPAIGN] });
      await setDoc(doc(db, `campaigns/${CAMPAIGN}`), { name: 'Fiber', type: 'fiber', dispositions: [] });
      const base = { campaignId: CAMPAIGN, lat: 40.1, lng: -75.6, notHomeCount: 0, address: 'x', city: 'y', last: null };
      // h1: rep's door on mgr's team. h2: mgr's own door with no manager. h3: already deleted by mgr.
      await setDoc(doc(db, 'houses/h1'), { ...base, assignedRepId: 'rep', managerId: 'mgr' });
      await setDoc(doc(db, 'houses/h2'), { ...base, assignedRepId: 'mgr', managerId: null });
      await setDoc(doc(db, 'houses/h3'), {
        ...base,
        campaignId: '_deleted',
        deleted: { by: 'mgr', at: AT, campaignId: CAMPAIGN },
        assignedRepId: 'rep',
        managerId: 'mgr',
      });
    });
  });

  const asUser = (uid: string) => env.authenticatedContext(uid).firestore();
  const del = (uid: string, extra: Record<string, unknown> = {}) => ({
    campaignId: '_deleted',
    deleted: { by: uid, at: AT, campaignId: CAMPAIGN },
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const restore = () => ({ campaignId: CAMPAIGN, deleted: deleteField(), updatedAt: serverTimestamp() });

  it("lets a manager delete their team's door and their own", async () => {
    await assertSucceeds(updateDoc(doc(asUser('mgr'), 'houses/h1'), del('mgr')));
    await assertSucceeds(updateDoc(doc(asUser('mgr'), 'houses/h2'), del('mgr')));
  });

  it("refuses a manager deleting another team's door", async () => {
    await assertFails(updateDoc(doc(asUser('mgr2'), 'houses/h1'), del('mgr2')));
  });

  it('refuses a delete that also changes other keys', async () => {
    await assertFails(updateDoc(doc(asUser('mgr'), 'houses/h1'), del('mgr', { notHomeCount: 1 })));
    await assertFails(updateDoc(doc(asUser('mgr'), 'houses/h1'), del('mgr', { assignedRepId: 'mgr' })));
  });

  it('refuses a stamp naming someone else, another campaign or extra fields', async () => {
    const h1 = doc(asUser('mgr'), 'houses/h1');
    await assertFails(updateDoc(h1, del('mgr', { deleted: { by: 'rep', at: AT, campaignId: CAMPAIGN } })));
    await assertFails(updateDoc(h1, del('mgr', { deleted: { by: 'mgr', at: AT, campaignId: 'x' } })));
    await assertFails(updateDoc(h1, del('mgr', { deleted: { by: 'mgr', at: AT, campaignId: CAMPAIGN, x: 1 } })));
  });

  it('lets a manager restore a deleted door to the campaign in its stamp', async () => {
    await assertSucceeds(updateDoc(doc(asUser('mgr'), 'houses/h3'), restore()));
  });

  it('refuses a restore into a different campaign or one that keeps the stamp', async () => {
    const h3 = doc(asUser('mgr'), 'houses/h3');
    await assertFails(updateDoc(h3, { ...restore(), campaignId: 'other' }));
    await assertFails(updateDoc(h3, { campaignId: CAMPAIGN, updatedAt: serverTimestamp() }));
  });

  it('refuses deleting a door that is already deleted', async () => {
    const h3 = doc(asUser('mgr'), 'houses/h3');
    await assertFails(updateDoc(h3, del('mgr', { deleted: { by: 'mgr', at: AT + 1, campaignId: '_deleted' } })));
    await assertFails(updateDoc(h3, { deleted: { by: 'mgr', at: AT + 1, campaignId: CAMPAIGN }, updatedAt: serverTimestamp() }));
  });

  it('refuses a rep (non-manager) deleting or restoring their own door', async () => {
    await assertFails(updateDoc(doc(asUser('rep'), 'houses/h1'), del('rep')));
    await assertFails(updateDoc(doc(asUser('rep'), 'houses/h3'), restore()));
  });
});
