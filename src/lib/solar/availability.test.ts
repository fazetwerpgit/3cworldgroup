import { describe, expect, it } from 'vitest';
import {
  OWNER_VIRTUAL,
  bookingDocId,
  formatSlotPT,
  openSlots,
  seedAvailability,
  zonedToUtc,
  type SolarAvailability,
} from './availability';

const OWNER = { uid: 'owner1', name: 'Owner' };
const JACOB = { uid: 'jacob1', name: 'Jacob' };
const SEED = seedAvailability(OWNER, JACOB);
const EARLY = new Date('2026-01-01T00:00:00Z');

// Monday 2026-10-26 (PDT, UTC-7) and Monday 2026-11-02 (PST, UTC-8).
const day = (iso: string) => ({ from: new Date(`${iso}T00:00:00-08:00`), to: new Date(`${iso}T23:59:00-08:00`) });

describe('seedAvailability', () => {
  it('gives the owner both modes and Jacob a copy of the owner virtual hours', () => {
    expect(SEED.map((a) => a.consultantUid)).toEqual(['owner1', 'jacob1']);
    expect(SEED[1].modes.virtual).toEqual(OWNER_VIRTUAL);
    expect(SEED[1].modes.in_person).toEqual([]);
    expect(SEED[0].tz).toBe('America/Los_Angeles');
    expect(SEED[0].slotMin).toBe(60);
  });
  it('drops a missing consultant', () => {
    expect(seedAvailability(null, JACOB).map((a) => a.consultantUid)).toEqual(['jacob1']);
  });
});

describe('openSlots', () => {
  it('lists Monday 8-5 hourly slots in PDT (8am = 15:00Z)', () => {
    const { from, to } = day('2026-10-26');
    const slots = openSlots(SEED, [], 'in_person', from, to, EARLY);
    expect(slots).toHaveLength(9);
    expect(slots[0]).toEqual({ consultantUid: 'owner1', name: 'Owner', start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:00:00.000Z' });
    expect(slots.at(-1)?.start).toBe('2026-10-26T23:00:00.000Z');
  });

  it('shifts to PST after fall-back (8am = 16:00Z)', () => {
    const { from, to } = day('2026-11-02');
    const slots = openSlots(SEED, [], 'in_person', from, to, EARLY);
    expect(slots[0].start).toBe('2026-11-02T16:00:00.000Z');
    expect(slots).toHaveLength(9);
  });

  it('spans the DST change and keeps every slot on local wall-clock hours', () => {
    const slots = openSlots(SEED, [], 'virtual', new Date('2026-10-30T00:00:00Z'), new Date('2026-11-04T00:00:00Z'), EARLY);
    const local = slots.map((s) =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(s.start))
    );
    expect(local.every((t) => /^(0[89]|1\d):00$/.test(t))).toBe(true);
    // Sunday Nov 1 (the fall-back day) has no hours.
    expect(slots.some((s) => s.start.startsWith('2026-11-01T1'))).toBe(false);
  });

  it('includes both consultants for virtual, sorted by start then name', () => {
    const { from, to } = day('2026-10-26');
    const slots = openSlots(SEED, [], 'virtual', from, to, EARLY);
    expect(slots).toHaveLength(18);
    expect(slots.slice(0, 2).map((s) => s.name)).toEqual(['Jacob', 'Owner']);
  });

  it('removes a taken slot for that consultant in every mode, ignoring cancelled ones', () => {
    const { from, to } = day('2026-10-26');
    const bookings = [
      { consultantUid: 'owner1', start: '2026-10-26T15:00:00.000Z' },
      { consultantUid: 'owner1', start: '2026-10-26T17:00:00.000Z', status: 'cancelled' },
    ];
    const inPerson = openSlots(SEED, bookings, 'in_person', from, to, EARLY);
    expect(inPerson.map((s) => s.start)).not.toContain('2026-10-26T15:00:00.000Z');
    expect(inPerson.map((s) => s.start)).toContain('2026-10-26T17:00:00.000Z');
    const virtual = openSlots(SEED, bookings, 'virtual', from, to, EARLY);
    expect(virtual.filter((s) => s.start === '2026-10-26T15:00:00.000Z').map((s) => s.consultantUid)).toEqual(['jacob1']);
  });

  it('hides slots that start before now and outside [from, to)', () => {
    const { from, to } = day('2026-10-26');
    const slots = openSlots(SEED, [], 'in_person', from, to, new Date('2026-10-26T19:30:00Z'));
    expect(slots[0].start).toBe('2026-10-26T20:00:00.000Z');
    expect(openSlots(SEED, [], 'in_person', to, from, EARLY)).toEqual([]);
  });

  it('keeps Saturday 12-8 virtual and no in-person on Wednesday', () => {
    const sat = day('2026-10-31');
    const v = openSlots(SEED, [], 'virtual', sat.from, sat.to, EARLY).filter((s) => s.consultantUid === 'owner1');
    expect(v).toHaveLength(8);
    expect(v[0].start).toBe('2026-10-31T19:00:00.000Z');
    const wed = day('2026-10-28');
    expect(openSlots(SEED, [], 'in_person', wed.from, wed.to, EARLY)).toEqual([]);
  });

  it('honors a custom slot length', () => {
    const custom: SolarAvailability[] = [
      { consultantUid: 'c', name: 'C', tz: 'America/Los_Angeles', slotMin: 30, modes: { virtual: [{ day: 1, start: '09:00', end: '10:00' }] } },
    ];
    const { from, to } = day('2026-10-26');
    expect(openSlots(custom, [], 'virtual', from, to, EARLY).map((s) => s.start)).toEqual([
      '2026-10-26T16:00:00.000Z',
      '2026-10-26T16:30:00.000Z',
    ]);
  });
});

describe('zonedToUtc', () => {
  it('returns null inside the spring-forward gap', () => {
    expect(zonedToUtc(2026, 3, 8, 2, 30, 'America/Los_Angeles')).toBeNull();
  });
  it('converts both sides of the change', () => {
    expect(new Date(zonedToUtc(2026, 3, 9, 8, 0, 'America/Los_Angeles')!).toISOString()).toBe('2026-03-09T15:00:00.000Z');
    expect(new Date(zonedToUtc(2026, 3, 6, 8, 0, 'America/Los_Angeles')!).toISOString()).toBe('2026-03-06T16:00:00.000Z');
  });
});

describe('helpers', () => {
  it('builds booking ids and PT labels', () => {
    expect(bookingDocId('u', '2026-10-26T15:00:00.000Z')).toBe('u_2026-10-26T15:00:00.000Z');
    expect(formatSlotPT('2026-10-26T15:00:00.000Z')).toBe('Monday, October 26 at 8:00 AM');
  });
});
