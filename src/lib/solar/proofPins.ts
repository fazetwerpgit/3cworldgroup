// "Booked nearby" / "Went solar" pins on the 3C Doors map (3c-knock
// docs/design/NEARBY_LEADS.md option B; the app's src/lib/proofPins.ts). One
// doc per knock door, proofPins/{houseId}, holding exactly six fields:
//   { campaignId, cell (geohash-5), lat, lng (3 decimals, ~110 m), kind, at (ms) }
// Positions are approximate on purpose (owner, 2026-10-22): a ~110 m grid, never the exact house.
// No name, phone, address, note or rep (a tapped pin shows only its status and
// age). The app writes kind 'booked' with an Appointment Booked mark; the
// portal owns the rest, past the rules (admin SDK):
//   - a lead goes Sold         -> kind 'solar', at = the sold time (created if missing)
//   - a lead goes lost, or its booking is cancelled (not on a sold lead) -> delete
//   - a sold or lost lead reopened, or a lead booked again after a cancel -> back to
//     'booked' while the door's own mark is still Appointment Booked, else delete
// A solar pin is only ever removed or downgraded by a lead that WAS sold and
// is now lost or reopened ('unsold-delete' / 'unsold-restore'). Every other
// delete / restore reads the pin in the same transaction and leaves a solar one
// alone, so a late cancel (or a second lead on the same door) can't undo a sale.
// A lead links to its door through solarLeads.doorId (the knock house id the
// app sends as `doorId`); a lead without one has no pin. Pin writes never fail
// the action that triggers them: errors are logged and swallowed.
import { geohashEncode } from '@/lib/knock/area/geohash';
import { isSoldLead } from '@/lib/solar/closePermission';

export const PROOF_PINS_COLLECTION = 'proofPins';
/** The disposition id an Appointment Booked mark carries (the rules check the same id). */
export const PROOF_BOOKED_RESULT = 'appointment_set';
export const PROOF_CELL_PRECISION = 5;
export const PROOF_POSITION_DECIMALS = 3;

export type ProofPinKind = 'booked' | 'solar';

export interface ProofPinDoc {
  campaignId: string;
  cell: string;
  lat: number;
  lng: number;
  kind: ProofPinKind;
  at: number;
}

/**
 * What a lead write does to its door's pin. 'delete' / 'restore' never touch a
 * solar pin; 'unsold-delete' / 'unsold-restore' (a sold lead lost / reopened) may.
 */
export type ProofPinChange = 'solar' | 'delete' | 'restore' | 'unsold-delete' | 'unsold-restore';

type Data = Record<string, unknown>;
type Snap = { exists: boolean; data: () => Data | undefined };
type Tx = {
  get: (ref: never) => Promise<Snap>;
  set: (ref: never, data: Data) => unknown;
  delete: (ref: never) => unknown;
};
/** The admin Firestore calls used here, typed loosely so the solar test fakeDb fits too. */
export type PinDb = {
  collection: (name: string) => { doc: (id: string) => unknown };
  runTransaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** A coordinate rounded to PROOF_POSITION_DECIMALS (3: ~110 m; -0 becomes 0). */
export function roundCoord(value: number): number {
  const f = 10 ** PROOF_POSITION_DECIMALS;
  return Math.round(value * f) / f + 0;
}

/**
 * The pin for a houses doc, or null when the door has no usable campaign or
 * position. The campaign and position always come from the door.
 */
export function proofPinDoc(house: Data | null | undefined, kind: ProofPinKind, at: number): ProofPinDoc | null {
  if (!house) return null;
  const { campaignId, lat, lng } = house;
  if (typeof campaignId !== 'string' || !campaignId) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (!Number.isFinite(at) || at <= 0) return null;
  const rLat = roundCoord(lat);
  const rLng = roundCoord(lng);
  return {
    campaignId,
    cell: geohashEncode(rLat, rLng, PROOF_CELL_PRECISION),
    lat: rLat,
    lng: rLng,
    kind,
    at: Math.round(at),
  };
}

/** The campaignId a soft-deleted door carries (3c-knock docs/design/DELETE_DOORS.md). */
export const DELETED_CAMPAIGN_ID = '_deleted';

/** A houses doc the knock app soft-deleted: parked in '_deleted', or carrying a `deleted` stamp. */
export function isDeletedHouse(house: Data | null | undefined): boolean {
  if (!house) return false;
  return house.campaignId === DELETED_CAMPAIGN_ID || (house.deleted !== undefined && house.deleted !== null);
}

/** The knock house a solar lead came from (solarLeads.doorId), or null. */
export function leadDoorId(lead: Data | null | undefined): string | null {
  const id = lead?.doorId;
  return typeof id === 'string' && DOC_ID_RE.test(id) ? id : null;
}

/** The door's own mark is Appointment Booked (not a lead-file import): its time, else null. */
export function bookedMarkAt(house: Data | null | undefined): number | null {
  const last = house?.last as Data | null | undefined;
  if (!last || typeof last !== 'object') return null;
  if (last.dispositionId !== PROOF_BOOKED_RESULT || last.imported === true) return null;
  return typeof last.at === 'number' && Number.isFinite(last.at) && last.at > 0 ? last.at : null;
}

/**
 * The pin change a lead write makes, from the lead as it was to the lead as
 * written: going sold -> 'solar'; going lost -> 'delete' ('unsold-delete'
 * when it was sold); a lost lead reopened -> 'restore', a sold one ->
 * 'unsold-restore'; anything else -> null.
 */
export function proofPinChangeForLead(before: Data, after: Data): ProofPinChange | null {
  const wasSold = isSoldLead(before);
  const isSold = isSoldLead(after);
  const wasLost = before.status === 'lost';
  const isLost = after.status === 'lost';
  if (isSold && !wasSold) return 'solar';
  if (isLost && !wasLost) return wasSold ? 'unsold-delete' : 'delete';
  if ((wasSold || wasLost) && !isSold && !isLost) return wasSold ? 'unsold-restore' : 'restore';
  return null;
}

/** Epoch ms of a Firestore Timestamp, Date, ISO string or number; null otherwise. */
export function toMillis(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return toMillis((value as { toMillis: () => unknown }).toMillis());
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Apply `change` to the pin of `lead`'s door, in one transaction that reads
 * the pin and the door first. `at` is the sold time for 'solar'. Never throws:
 * a lead without a door, a missing door, or a failed write is logged (house id
 * prefix only) and skipped.
 */
export async function applyProofPinChange(
  db: PinDb | null | undefined,
  lead: Data | null | undefined,
  change: ProofPinChange | null,
  at: number
): Promise<void> {
  if (!db || !change) return;
  const houseId = leadDoorId(lead);
  if (!houseId) return;
  const tag = houseId.slice(0, 6);
  // Only a lead that was sold may remove or downgrade a solar pin.
  const mayTouchSolar = change === 'unsold-delete' || change === 'unsold-restore';
  try {
    const pinRef = db.collection(PROOF_PINS_COLLECTION).doc(houseId) as never;
    const houseRef = db.collection('houses').doc(houseId) as never;
    const note = await db.runTransaction(async (tx) => {
      const existing = (await tx.get(pinRef)).data();
      const house = (await tx.get(houseRef)).data();
      // A soft-deleted door gets no pin: drop any it has (even a solar one) instead of writing one.
      if (change !== 'delete' && change !== 'unsold-delete' && isDeletedHouse(house)) {
        if (existing) tx.delete(pinRef);
        return null;
      }
      if (existing?.kind === 'solar' && (change === 'solar' || !mayTouchSolar)) return null; // keeps its sold time
      if (change === 'delete' || change === 'unsold-delete') {
        if (existing) tx.delete(pinRef);
        return null;
      }
      if (!house) return 'not found';
      if (change === 'solar') {
        const pin = proofPinDoc(house, 'solar', at);
        if (!pin) return 'has no campaign or position';
        tx.set(pinRef, { ...pin });
        return null;
      }
      // restore: 'booked' while the door's own mark is still Appointment Booked, else gone.
      const bookedAt = bookedMarkAt(house);
      const pin = bookedAt === null ? null : proofPinDoc(house, 'booked', bookedAt);
      if (pin) tx.set(pinRef, { ...pin });
      else if (existing) tx.delete(pinRef);
      return null;
    });
    if (note) console.warn(`proof pin: door ${tag}… ${note}; skipped`);
  } catch (error) {
    console.error(`proof pin ${change} failed for door ${tag}…:`, error);
  }
}
