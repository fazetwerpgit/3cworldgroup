import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFakeDb } from '@/lib/solar/testing/fakeDb';
import {
  applyProofPinChange,
  bookedMarkAt,
  leadDoorId,
  proofPinChangeForLead,
  proofPinDoc,
  roundCoord,
  toMillis,
} from './proofPins';

const HOUSE = {
  campaignId: 'solar-1',
  lat: 40.123456,
  lng: -75.65421,
  address: '12 Main St',
  last: { dispositionId: 'appointment_set', at: 1_760_000_000_000, repId: 'rep1', knockId: 'k1' },
};
const SOLD_AT = 1_761_000_000_000;
const pinKeys = ['at', 'campaignId', 'cell', 'kind', 'lat', 'lng'];

afterEach(() => vi.restoreAllMocks());

describe('proofPinDoc', () => {
  it('keeps exactly the six fields, rounded to 3 decimals, with a geohash-5 cell', () => {
    const pin = proofPinDoc(HOUSE, 'solar', SOLD_AT)!;
    expect(Object.keys(pin).sort()).toEqual(pinKeys);
    expect(pin).toMatchObject({ campaignId: 'solar-1', lat: 40.123, lng: -75.654, kind: 'solar', at: SOLD_AT });
    expect(pin.cell).toMatch(/^[0-9b-hjkmnp-z]{5}$/);
    expect(pin.cell).toBe('dr4hq');
  });

  it('refuses a door without a campaign or a real position', () => {
    expect(proofPinDoc(null, 'solar', SOLD_AT)).toBeNull();
    expect(proofPinDoc({ ...HOUSE, campaignId: '' }, 'solar', SOLD_AT)).toBeNull();
    expect(proofPinDoc({ ...HOUSE, lat: Number.NaN }, 'solar', SOLD_AT)).toBeNull();
    expect(proofPinDoc({ ...HOUSE, lng: 200 }, 'solar', SOLD_AT)).toBeNull();
    expect(proofPinDoc(HOUSE, 'solar', 0)).toBeNull();
  });

  it('rounds like the app (and -0 becomes 0)', () => {
    expect(roundCoord(-0.0001)).toBe(0);
    expect(Object.is(roundCoord(-0.0001), 0)).toBe(true);
    expect(roundCoord(12.3456)).toBe(12.346);
  });
});

describe('link and mark helpers', () => {
  it('reads the knock house id from doorId', () => {
    expect(leadDoorId({ doorId: 'h_1-A' })).toBe('h_1-A');
    expect(leadDoorId({ doorId: '' })).toBeNull();
    expect(leadDoorId({ doorId: 'a/b' })).toBeNull();
    expect(leadDoorId({})).toBeNull();
  });

  it('takes only a real Appointment Booked mark', () => {
    expect(bookedMarkAt(HOUSE)).toBe(HOUSE.last.at);
    expect(bookedMarkAt({ ...HOUSE, last: { ...HOUSE.last, imported: true } })).toBeNull();
    expect(bookedMarkAt({ ...HOUSE, last: { ...HOUSE.last, dispositionId: 'not_home' } })).toBeNull();
    expect(bookedMarkAt({ ...HOUSE, last: null })).toBeNull();
  });

  it('reads times from timestamps, dates, strings and numbers', () => {
    expect(toMillis({ toMillis: () => 5 })).toBe(5);
    expect(toMillis(new Date(7))).toBe(7);
    expect(toMillis('1970-01-01T00:00:00.009Z')).toBe(9);
    expect(toMillis(null)).toBeNull();
  });
});

describe('proofPinChangeForLead', () => {
  it.each([
    ['booked -> sold', { status: 'booked' }, { status: 'sold' }, 'solar'],
    ['booked -> sale stage', { status: 'booked' }, { status: 'sold', stage: 'appointment_demoed', stageOutcome: 'sale' }, 'solar'],
    ['booked -> lost', { status: 'booked' }, { status: 'lost' }, 'delete'],
    ['sold -> lost', { status: 'sold' }, { status: 'lost' }, 'delete'],
    ['sold -> reopened', { status: 'sold' }, { status: 'booked', stage: null }, 'restore'],
    ['lost -> reopened', { status: 'lost' }, { status: 'new' }, 'restore'],
    ['sold -> later stage', { status: 'sold' }, { status: 'sold', stage: 'site_survey' }, null],
    ['proposal sent', { status: 'booked' }, { status: 'booked', stage: 'appointment_demoed', stageOutcome: 'proposal_sent' }, null],
  ])('%s', (_name, before, after, want) => {
    expect(proofPinChangeForLead(before, after)).toBe(want);
  });
});

describe('applyProofPinChange', () => {
  const seed = (pins: Record<string, Record<string, unknown>> = {}) =>
    createFakeDb({ houses: { h1: { ...HOUSE } }, proofPins: pins });
  const lead = { doorId: 'h1', campaignId: 'solar-1', status: 'sold' };

  it('creates the solar pin when missing, from the door, at the sold time', async () => {
    const db = seed();
    await applyProofPinChange(db, lead, 'solar', SOLD_AT);
    const pin = db.store.get('proofPins')!.get('h1')!;
    expect(Object.keys(pin).sort()).toEqual(pinKeys);
    expect(pin).toMatchObject({ kind: 'solar', at: SOLD_AT, campaignId: 'solar-1', lat: 40.123, lng: -75.654 });
  });

  it('turns a booked pin solar, and leaves a solar pin (and its time) alone', async () => {
    const db = seed({ h1: proofPinDoc(HOUSE, 'booked', HOUSE.last.at)! as never });
    await applyProofPinChange(db, lead, 'solar', SOLD_AT);
    expect(db.store.get('proofPins')!.get('h1')).toMatchObject({ kind: 'solar', at: SOLD_AT });
    await applyProofPinChange(db, lead, 'solar', SOLD_AT + 999);
    expect(db.store.get('proofPins')!.get('h1')!.at).toBe(SOLD_AT);
  });

  it('deletes on delete, and restores booked only while the door is booked', async () => {
    const db = seed({ h1: proofPinDoc(HOUSE, 'solar', SOLD_AT)! as never });
    await applyProofPinChange(db, lead, 'restore', SOLD_AT);
    expect(db.store.get('proofPins')!.get('h1')).toMatchObject({ kind: 'booked', at: HOUSE.last.at });
    await applyProofPinChange(db, lead, 'delete', SOLD_AT);
    expect(db.store.get('proofPins')!.has('h1')).toBe(false);
    db.store.get('houses')!.set('h1', { ...HOUSE, last: { ...HOUSE.last, dispositionId: 'not_interested' } });
    db.store.get('proofPins')!.set('h1', proofPinDoc(HOUSE, 'booked', 1)! as never);
    await applyProofPinChange(db, lead, 'restore', SOLD_AT);
    expect(db.store.get('proofPins')!.has('h1')).toBe(false);
  });

  it('skips a lead without a door, and a door that is missing', async () => {
    const db = seed();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await applyProofPinChange(db, { status: 'sold' }, 'solar', SOLD_AT);
    await applyProofPinChange(db, { doorId: 'gone' }, 'solar', SOLD_AT);
    expect(db.store.get('proofPins')!.size).toBe(0);
  });

  it('never throws when the write fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('down'); }, delete: async () => { throw new Error('down'); } }) }) };
    await expect(applyProofPinChange(broken, lead, 'solar', SOLD_AT)).resolves.toBeUndefined();
    await expect(applyProofPinChange(broken, lead, 'delete', SOLD_AT)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(2);
  });
});
