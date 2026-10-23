// Firestore security rules for proofPins/{houseId} ("Booked nearby" / "Went solar" pins), run
// against the Firestore EMULATOR only. Skipped unless FIRESTORE_EMULATOR_HOST is set, so the
// normal `vitest run` never needs Java or an emulator.
//
//   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v*.jar \
//     --host 127.0.0.1 --port 8187 &
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 npx vitest run src/lib/firebase/proofPins.rules.test.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

const CAMPAIGN = 'solar-1';
const OTHER_CAMPAIGN = 'solar-2';
const BOOKED_AT = 1_760_000_000_000;
// A door at 40.123456, -75.65421; its pin keeps 3 decimals (~110 m).
const DOOR = { lat: 40.123456, lng: -75.65421 };
const PIN = { campaignId: CAMPAIGN, cell: 'dr4hq', lat: 40.123, lng: -75.654, kind: 'booked', at: BOOKED_AT };

const bookedMark = (repId: string, at = BOOKED_AT) => ({
  dispositionId: 'appointment_set',
  at,
  repId,
  knockId: `k-${repId}`,
});

describe.skipIf(!emulatorHost)('firestore.rules: proofPins', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = emulatorHost!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-proofpins-rules',
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
      await setDoc(doc(db, 'users/rep2'), { status: 'active', role: 'user', managerId: 'mgr', campaignIds: [CAMPAIGN] });
      await setDoc(doc(db, 'users/mgr'), { status: 'active', role: 'user', fieldRole: 'l1_manager', campaignIds: [CAMPAIGN] });
      await setDoc(doc(db, 'users/outsider'), { status: 'active', role: 'user', campaignIds: [OTHER_CAMPAIGN] });
      await setDoc(doc(db, 'users/boss'), { status: 'active', role: 'owner', campaignIds: [] });
      await setDoc(doc(db, 'users/off'), { status: 'inactive', role: 'user', campaignIds: [CAMPAIGN] });
      await setDoc(doc(db, `campaigns/${CAMPAIGN}`), { name: 'Solar', type: 'solar', dispositions: [] });
      // Doors: h1 is rep's (not yet marked), h2 is rep2's and already booked by rep2, h3 is
      // rep's and booked by them as an imported lead-file status.
      const base = { campaignId: CAMPAIGN, ...DOOR, managerId: 'mgr', notHomeCount: 0, address: 'x', city: 'y' };
      await setDoc(doc(db, 'houses/h1'), { ...base, assignedRepId: 'rep', last: null });
      await setDoc(doc(db, 'houses/h2'), { ...base, assignedRepId: 'rep2', last: bookedMark('rep2') });
      await setDoc(doc(db, 'houses/h3'), {
        ...base,
        assignedRepId: 'rep',
        last: { ...bookedMark('rep'), knockId: '', imported: true },
      });
      await setDoc(doc(db, 'proofPins/p1'), PIN);
      await setDoc(doc(db, 'proofPins/p2'), { ...PIN, campaignId: OTHER_CAMPAIGN });
      await setDoc(doc(db, 'proofPins/h2'), PIN);
      await setDoc(doc(db, 'houses/hs'), { ...base, assignedRepId: 'rep', last: bookedMark('rep') });
      await setDoc(doc(db, 'proofPins/hs'), { ...PIN, kind: 'solar' });
    });
  });

  const asUser = (uid: string) => env.authenticatedContext(uid).firestore();

  /** The app's knock batch: book the door and write its pin in the same commit. */
  const bookAndPin = (db: ReturnType<typeof asUser>, houseId: string, uid: string, pin: Record<string, unknown>) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'houses', houseId), { last: bookedMark(uid), updatedAt: BOOKED_AT });
    batch.set(doc(db, 'proofPins', houseId), pin);
    return batch.commit();
  };

  describe('read', () => {
    it('lets a rep on the campaign read a pin and run the nearby query', async () => {
      await assertSucceeds(getDoc(doc(asUser('rep'), 'proofPins/p1')));
      await assertSucceeds(
        getDocs(
          query(
            collection(asUser('rep'), 'proofPins'),
            where('campaignId', '==', CAMPAIGN),
            where('cell', 'in', ['dr4hq', 'dr4hr']),
          ),
        ),
      );
    });

    it('lets a manager on the campaign and an owner read', async () => {
      await assertSucceeds(getDoc(doc(asUser('mgr'), 'proofPins/p1')));
      await assertSucceeds(getDoc(doc(asUser('boss'), 'proofPins/p2')));
    });

    it('denies a non-member, a switched-off user and a signed-out caller', async () => {
      await assertFails(getDoc(doc(asUser('outsider'), 'proofPins/p1')));
      await assertFails(getDoc(doc(asUser('rep'), 'proofPins/p2')));
      await assertFails(getDoc(doc(asUser('off'), 'proofPins/p1')));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'proofPins/p1')));
      await assertFails(
        getDocs(query(collection(asUser('outsider'), 'proofPins'), where('campaignId', '==', CAMPAIGN))),
      );
    });

    it('denies a query not scoped to one of my campaigns', async () => {
      await assertFails(getDocs(query(collection(asUser('rep'), 'proofPins'), where('cell', '==', 'dr4hq'))));
    });
  });

  describe('client create / update', () => {
    it('allows a booked pin written with my own Appointment Booked mark', async () => {
      await assertSucceeds(bookAndPin(asUser('rep'), 'h1', 'rep', PIN));
    });

    it('denies a pin whose door ends up with another disposition', async () => {
      const db = asUser('rep');
      const batch = writeBatch(db);
      batch.update(doc(db, 'houses/h1'), {
        last: { ...bookedMark('rep'), dispositionId: 'not_interested' },
        updatedAt: BOOKED_AT,
      });
      batch.set(doc(db, 'proofPins/h1'), PIN);
      await assertFails(batch.commit());
    });

    it('denies a pin alone, with no booking in the batch', async () => {
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/h1'), PIN));
    });

    it("denies a pin on someone else's booked door", async () => {
      // h2 is booked by rep2; rep can neither create nor overwrite its pin.
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/h2'), { ...PIN, at: BOOKED_AT }));
    });

    it('denies a pin on an imported (lead-file) booking', async () => {
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/h3'), PIN));
    });

    it('denies an extra field, a missing field and kind solar', async () => {
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, repId: 'rep' }));
      const noCell: Record<string, unknown> = { ...PIN };
      delete noCell.cell;
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', noCell));
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, kind: 'solar' }));
    });

    it('denies a forged position, time, campaign or cell', async () => {
      // Exact (unrounded) position: more than 3 decimals.
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, lat: DOOR.lat }));
      // The old 4-decimal grid (~11 m) is too exact now.
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, lat: 40.1235, lng: -75.6543 }));
      // A 3-decimal point that is not the door's nearest (0.00068 and 0.0015 away).
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, lng: -75.655 }));
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, lat: 40.125 }));
      // A rounded position far from the door.
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, lat: 41.123 }));
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, at: BOOKED_AT + 1 }));
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, campaignId: OTHER_CAMPAIGN }));
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, cell: 'DR4HQ' }));
      await assertFails(bookAndPin(asUser('rep'), 'h1', 'rep', { ...PIN, lat: '40.123' }));
    });

    it('denies a pin write when houses/{id} does not exist', async () => {
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/no-such-house'), PIN));
    });

    it("denies overwriting the portal's solar pin", async () => {
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/hs'), PIN));
    });
  });

  describe('client delete', () => {
    const remarkAndDelete = (uid: string, houseId: string, dispositionId = 'not_interested') => {
      const db = asUser(uid);
      const batch = writeBatch(db);
      batch.update(doc(db, 'houses', houseId), { last: { ...bookedMark(uid), dispositionId }, updatedAt: BOOKED_AT });
      batch.delete(doc(db, 'proofPins', houseId));
      return batch.commit();
    };

    it('allows a rep who re-marks their booked door to delete its pin in the same batch', async () => {
      await assertSucceeds(remarkAndDelete('rep2', 'h2'));
    });

    it('denies a delete while the door is still booked (rep or owner, no re-mark)', async () => {
      await assertFails(deleteDoc(doc(asUser('rep2'), 'proofPins/h2')));
      await assertFails(deleteDoc(doc(asUser('boss'), 'proofPins/h2')));
    });

    it('denies deleting a solar pin, even once its door is no longer booked', async () => {
      await assertFails(deleteDoc(doc(asUser('rep'), 'proofPins/hs')));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'houses/hs'), { campaignId: CAMPAIGN, ...DOOR, assignedRepId: 'rep', last: null });
      });
      await assertFails(deleteDoc(doc(asUser('rep'), 'proofPins/hs')));
      await assertFails(deleteDoc(doc(asUser('boss'), 'proofPins/hs')));
    });

    it('allows deleting a pin that is not there, and a booked pin whose door is gone', async () => {
      await assertSucceeds(deleteDoc(doc(asUser('rep'), 'proofPins/nothing-here')));
      await assertSucceeds(deleteDoc(doc(asUser('rep'), 'proofPins/p1')));
    });

    it('allows a manager soft-deleting a booked door to delete its booked pin in the same batch', async () => {
      const db = asUser('mgr');
      const batch = writeBatch(db);
      batch.update(doc(db, 'houses/h2'), {
        campaignId: '_deleted',
        deleted: { by: 'mgr', at: BOOKED_AT, campaignId: CAMPAIGN },
        updatedAt: BOOKED_AT,
      });
      batch.delete(doc(db, 'proofPins/h2'));
      await assertSucceeds(batch.commit());
    });

    it('still denies deleting the booked pin of a live booked door', async () => {
      await assertFails(deleteDoc(doc(asUser('mgr'), 'proofPins/h2')));
    });

    it('denies a booked pin for a soft-deleted door, even with my own booked mark on it', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'houses/hd'), {
          campaignId: '_deleted',
          deleted: { by: 'mgr', at: BOOKED_AT, campaignId: CAMPAIGN },
          ...DOOR,
          managerId: 'mgr',
          assignedRepId: 'rep',
          last: bookedMark('rep'),
        });
      });
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/hd'), { ...PIN, campaignId: '_deleted' }));
      await assertFails(setDoc(doc(asUser('rep'), 'proofPins/hd'), PIN));
    });

    it('denies a signed-out delete', async () => {
      await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), 'proofPins/p1')));
    });
  });
});
