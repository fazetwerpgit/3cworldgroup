import { describe, expect, it } from 'vitest';
import {
  JACOB_VIRTUAL,
  bookingDocId,
  HOMEOWNER_EARLIEST,
  HOMEOWNER_LATEST_START,
  formatSlotPT,
  openSlots,
  orderByPreference,
  seedAvailability,
  withinHomeownerHours,
  zonedToUtc,
  type SolarAvailability,
  type SolarBookingLike,
  type SolarMode,
} from './availability';

const OWNER = { uid: 'owner1', name: 'Owner' };
const JACOB = { uid: 'jacob1', name: 'Jacob' };
const SEED = seedAvailability(OWNER, JACOB);
const EARLY = new Date('2026-01-01T00:00:00Z');

// Monday 2026-10-26 (PDT, UTC-7) and Monday 2026-11-02 (PST, UTC-8).
// The tests below check consultant-hour mechanics, so they read as a Mountain
// homeowner (PT + 1): every Pacific 8 AM - 7 PM start falls inside the 9 AM -
// 8 PM homeowner cap. The cap itself is tested in 'homeowner hours'.
const MT = 'America/Denver';
const openMT = (a: SolarAvailability[], b: SolarBookingLike[], mode: SolarMode, from: Date, to: Date, now: Date) =>
  openSlots(a, b, mode, from, to, now, MT);

const day = (iso: string) => ({ from: new Date(`${iso}T00:00:00-08:00`), to: new Date(`${iso}T23:59:00-08:00`) });

describe('seedAvailability', () => {
  it('gives the owner both modes in PT and Jacob virtual Mon-Fri 10-5 in CT', () => {
    expect(SEED.map((a) => a.consultantUid)).toEqual(['owner1', 'jacob1']);
    expect(SEED[1].modes.virtual).toEqual(JACOB_VIRTUAL);
    expect(JACOB_VIRTUAL.map((x) => `${x.day} ${x.start}-${x.end}`)).toEqual([
      '1 10:00-17:00', '2 10:00-17:00', '3 10:00-17:00', '4 10:00-17:00', '5 10:00-17:00',
    ]);
    expect(SEED[1].modes.in_person).toEqual([]);
    expect(SEED[1].tz).toBe('America/Chicago');
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
    const slots = openMT(SEED, [], 'in_person', from, to, EARLY);
    expect(slots).toHaveLength(9);
    expect(slots[0]).toEqual({ consultantUid: 'owner1', name: 'Owner', start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:00:00.000Z' });
    expect(slots.at(-1)?.start).toBe('2026-10-26T23:00:00.000Z');
  });

  it('shifts to PST after fall-back (8am = 16:00Z)', () => {
    const { from, to } = day('2026-11-02');
    const slots = openMT(SEED, [], 'in_person', from, to, EARLY);
    expect(slots[0].start).toBe('2026-11-02T16:00:00.000Z');
    expect(slots).toHaveLength(9);
  });

  it('spans the DST change and keeps every slot on local wall-clock hours', () => {
    const slots = openMT(SEED, [], 'virtual', new Date('2026-10-30T00:00:00Z'), new Date('2026-11-04T00:00:00Z'), EARLY);
    const local = slots.map((s) =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(s.start))
    );
    expect(local.every((t) => /^(0[89]|1\d):00$/.test(t))).toBe(true);
    // Sunday Nov 1 (the fall-back day) has no hours.
    expect(slots.some((s) => s.start.startsWith('2026-11-01T1'))).toBe(false);
  });

  it('includes both consultants for virtual, sorted by start then name', () => {
    const { from, to } = day('2026-10-26');
    const slots = openMT(SEED, [], 'virtual', from, to, EARLY);
    // Owner 8-5 PT (9 slots) + Jacob 10-5 CT (7 slots); 10 AM CDT = 8 AM PDT = 15:00Z.
    expect(slots).toHaveLength(16);
    expect(slots.slice(0, 2).map((s) => s.name)).toEqual(['Jacob', 'Owner']);
  });

  it('removes a taken slot for that consultant in every mode, ignoring cancelled ones', () => {
    const { from, to } = day('2026-10-26');
    const bookings = [
      { consultantUid: 'owner1', start: '2026-10-26T15:00:00.000Z' },
      { consultantUid: 'owner1', start: '2026-10-26T17:00:00.000Z', status: 'cancelled' },
    ];
    const inPerson = openMT(SEED, bookings, 'in_person', from, to, EARLY);
    expect(inPerson.map((s) => s.start)).not.toContain('2026-10-26T15:00:00.000Z');
    expect(inPerson.map((s) => s.start)).toContain('2026-10-26T17:00:00.000Z');
    const virtual = openMT(SEED, bookings, 'virtual', from, to, EARLY);
    expect(virtual.filter((s) => s.start === '2026-10-26T15:00:00.000Z').map((s) => s.consultantUid)).toEqual(['jacob1']);
  });

  it('hides slots that start less than 2 hours from now and outside [from, to)', () => {
    const { from, to } = day('2026-10-26');
    const slots = openMT(SEED, [], 'in_person', from, to, new Date('2026-10-26T19:30:00Z'));
    expect(slots[0].start).toBe('2026-10-26T22:00:00.000Z');
    // Exactly 2 hours ahead is still bookable; 1h59m is not.
    expect(openMT(SEED, [], 'in_person', from, to, new Date('2026-10-26T13:00:00Z'))[0].start).toBe('2026-10-26T15:00:00.000Z');
    expect(openMT(SEED, [], 'in_person', from, to, new Date('2026-10-26T13:01:00Z'))[0].start).toBe('2026-10-26T16:00:00.000Z');
    expect(openMT(SEED, [], 'in_person', to, from, EARLY)).toEqual([]);
  });

  it('keeps Saturday 12-8 virtual and no in-person on Wednesday', () => {
    const sat = day('2026-10-31');
    const v = openMT(SEED, [], 'virtual', sat.from, sat.to, EARLY).filter((s) => s.consultantUid === 'owner1');
    expect(v).toHaveLength(8);
    expect(v[0].start).toBe('2026-10-31T19:00:00.000Z');
    const wed = day('2026-10-28');
    expect(openMT(SEED, [], 'in_person', wed.from, wed.to, EARLY)).toEqual([]);
  });

  it('honors a custom slot length', () => {
    const custom: SolarAvailability[] = [
      { consultantUid: 'c', name: 'C', tz: 'America/Los_Angeles', slotMin: 30, modes: { virtual: [{ day: 1, start: '09:00', end: '10:00' }] } },
    ];
    const { from, to } = day('2026-10-26');
    expect(openMT(custom, [], 'virtual', from, to, EARLY).map((s) => s.start)).toEqual([
      '2026-10-26T16:00:00.000Z',
      '2026-10-26T16:30:00.000Z',
    ]);
  });
});

describe('per-consultant time zones', () => {
  const jacob = (from: Date, to: Date) =>
    openMT(SEED, [], 'virtual', from, to, EARLY).filter((s) => s.consultantUid === 'jacob1').map((s) => s.start);

  it('reads Jacob hours in Central Time on both sides of fall-back', () => {
    // Fri Oct 30 is CDT (UTC-5): 10 AM = 15:00Z, last slot 4 PM = 21:00Z.
    const fri = jacob(new Date('2026-10-30T00:00:00Z'), new Date('2026-10-31T00:00:00Z'));
    expect(fri[0]).toBe('2026-10-30T15:00:00.000Z');
    expect(fri.at(-1)).toBe('2026-10-30T21:00:00.000Z');
    expect(fri).toHaveLength(7);
    // Mon Nov 2 is CST (UTC-6): 10 AM = 16:00Z.
    const mon = jacob(new Date('2026-11-02T00:00:00Z'), new Date('2026-11-03T00:00:00Z'));
    expect(mon[0]).toBe('2026-11-02T16:00:00.000Z');
    expect(mon).toHaveLength(7);
  });

  it('reads Jacob hours in Central Time on both sides of spring-forward', () => {
    expect(jacob(new Date('2026-03-06T00:00:00Z'), new Date('2026-03-07T00:00:00Z'))[0]).toBe('2026-03-06T16:00:00.000Z');
    expect(jacob(new Date('2026-03-09T00:00:00Z'), new Date('2026-03-10T00:00:00Z'))[0]).toBe('2026-03-09T15:00:00.000Z');
  });

  it('gives Jacob no weekend hours while the owner keeps Saturday', () => {
    const sat = day('2026-10-31');
    expect(jacob(sat.from, sat.to)).toEqual([]);
  });

  it('keeps the owner on Pacific Time', () => {
    const { from, to } = day('2026-11-02');
    const owner = openMT(SEED, [], 'virtual', from, to, EARLY).filter((s) => s.consultantUid === 'owner1');
    expect(owner[0].start).toBe('2026-11-02T16:00:00.000Z'); // 8 AM PST
  });
});

describe('homeowner hours (9:00 AM - 8:00 PM start, homeowner local time)', () => {
  // Jeremy-like: Pacific, virtual 8 AM - 8 PM on Mon and Fri (hourly starts 8 AM ... 7 PM PT).
  const PACIFIC: SolarAvailability[] = [
    {
      consultantUid: 'jer',
      name: 'Jeremy',
      tz: 'America/Los_Angeles',
      slotMin: 60,
      modes: { virtual: [1, 5].map((d) => ({ day: d, start: '08:00', end: '20:00' })) },
    },
  ];
  const starts = (tz: string | null | undefined, from: Date, to: Date, av = PACIFIC) =>
    openSlots(av, [], 'virtual', from, to, EARLY, tz).map((s) => s.start);
  const MON = day('2026-10-26'); // PDT (UTC-7), EDT (UTC-4)
  const SEVEN_PM_PT = '2026-10-27T02:00:00.000Z'; // Mon 7 PM PDT = 10 PM EDT

  it('caps at 9:00 AM and 8:00 PM', () => {
    expect([HOMEOWNER_EARLIEST, HOMEOWNER_LATEST_START]).toEqual(['09:00', '20:00']);
  });

  it("hides a Pacific consultant's 7 PM PT slot from an Eastern homeowner", () => {
    const et = starts('America/New_York', MON.from, MON.to);
    expect(et).not.toContain(SEVEN_PM_PT);
    expect(et).not.toContain('2026-10-27T01:00:00.000Z'); // 6 PM PT = 9 PM ET
    // 8 AM PT = 11 AM ET is fine; the last start is 5 PM PT = 8 PM ET.
    expect(et[0]).toBe('2026-10-26T15:00:00.000Z');
    expect(et.at(-1)).toBe('2026-10-27T00:00:00.000Z');
    expect(et).toHaveLength(10);
  });

  it('keeps the 7 PM PT slot for a Pacific homeowner, and hides 8 AM PT', () => {
    const pt = starts('America/Los_Angeles', MON.from, MON.to);
    expect(pt).toContain(SEVEN_PM_PT);
    expect(pt[0]).toBe('2026-10-26T16:00:00.000Z'); // 9 AM PT
    expect(pt).toHaveLength(11);
  });

  it('allows a start at exactly 8:00 PM local but not 8:01, and hides 8:59 AM', () => {
    // Mon Oct 26 in New York (EDT, UTC-4).
    expect(withinHomeownerHours(new Date('2026-10-27T00:00:00Z'), 'America/New_York')).toBe(true); // 8:00 PM
    expect(withinHomeownerHours(new Date('2026-10-27T00:01:00Z'), 'America/New_York')).toBe(false); // 8:01 PM
    expect(withinHomeownerHours(new Date('2026-10-26T12:59:00Z'), 'America/New_York')).toBe(false); // 8:59 AM
    expect(withinHomeownerHours(new Date('2026-10-26T13:00:00Z'), 'America/New_York')).toBe(true); // 9:00 AM
    // Through openSlots, with 1-minute slots around both edges.
    const edges: SolarAvailability[] = [
      {
        consultantUid: 'e',
        name: 'Edge',
        tz: 'America/New_York',
        slotMin: 1,
        modes: { virtual: [{ day: 1, start: '08:58', end: '09:01' }] },
      },
      {
        consultantUid: 'f',
        name: 'Late',
        tz: 'America/New_York',
        slotMin: 1,
        modes: { virtual: [{ day: 1, start: '19:59', end: '20:02' }] },
      },
    ];
    expect(starts('America/New_York', MON.from, MON.to, edges)).toEqual([
      '2026-10-26T13:00:00.000Z', // 9:00 AM
      '2026-10-26T23:59:00.000Z', // 7:59 PM
      '2026-10-27T00:00:00.000Z', // 8:00 PM
    ]);
  });

  it('follows each zone across the fall-back DST week', () => {
    // Arizona keeps MST (UTC-7) all year. Fri Oct 30 Pacific is PDT (UTC-7),
    // so Arizona = Pacific and 8 AM PT (8 AM MST) is hidden. Mon Nov 2 Pacific
    // is PST (UTC-8): 8 AM PT is 9 AM in Arizona and 7 PM PT is 8 PM, so all 12 show.
    const fri = day('2026-10-30');
    const mon = day('2026-11-02');
    const azFri = starts('America/Phoenix', fri.from, fri.to);
    expect(azFri[0]).toBe('2026-10-30T16:00:00.000Z'); // 9 AM PDT
    expect(azFri.at(-1)).toBe('2026-10-31T02:00:00.000Z'); // 7 PM PDT = 7 PM MST
    expect(azFri).toHaveLength(11);
    const azMon = starts('America/Phoenix', mon.from, mon.to);
    expect(azMon[0]).toBe('2026-11-02T16:00:00.000Z'); // 8 AM PST = 9 AM MST
    expect(azMon.at(-1)).toBe('2026-11-03T03:00:00.000Z'); // 7 PM PST = 8 PM MST
    expect(azMon).toHaveLength(12);
    // Eastern on both sides: the last start stays 5 PM PT (8 PM ET).
    expect(starts('America/New_York', fri.from, fri.to).at(-1)).toBe('2026-10-31T00:00:00.000Z');
    expect(starts('America/New_York', mon.from, mon.to).at(-1)).toBe('2026-11-03T01:00:00.000Z');
  });

  it("falls back to the consultant's zone when the homeowner's is unknown or invalid", () => {
    const pacific = starts('America/Los_Angeles', MON.from, MON.to);
    expect(starts(undefined, MON.from, MON.to)).toEqual(pacific);
    expect(starts(null, MON.from, MON.to)).toEqual(pacific);
    expect(starts('', MON.from, MON.to)).toEqual(pacific);
    expect(starts('Mars/Olympus', MON.from, MON.to)).toEqual(pacific);
  });
});

describe('orderByPreference', () => {
  const at = (start: string, consultantUid: string, name: string) => ({ consultantUid, name, start, end: start });
  const T1 = '2026-10-26T16:00:00.000Z';
  const T2 = '2026-10-26T17:00:00.000Z';

  it('puts the owner first for in person', () => {
    const out = orderByPreference([at(T1, 'jacob1', 'Jacob'), at(T1, 'owner1', 'Owner')], [], 'in_person', 'owner1');
    expect(out.map((s) => s.consultantUid)).toEqual(['owner1', 'jacob1']);
  });

  it('virtual: fewest bookings that Pacific day first, ties to the owner, times stay in order', () => {
    const slots = [at(T2, 'jacob1', 'Jacob'), at(T1, 'jacob1', 'Jacob'), at(T1, 'owner1', 'Owner'), at(T2, 'owner1', 'Owner')];
    expect(orderByPreference(slots, [], 'virtual', 'owner1').map((s) => `${s.start}|${s.consultantUid}`)).toEqual([
      `${T1}|owner1`, `${T1}|jacob1`, `${T2}|owner1`, `${T2}|jacob1`,
    ]);
    const busyOwner = [
      { consultantUid: 'owner1', start: '2026-10-26T20:00:00.000Z' },
      { consultantUid: 'owner1', start: '2026-10-27T20:00:00.000Z' }, // another day: ignored
      { consultantUid: 'jacob1', start: '2026-10-26T21:00:00.000Z', status: 'cancelled' }, // ignored
    ];
    expect(orderByPreference(slots, busyOwner, 'virtual', 'owner1').map((s) => s.consultantUid)).toEqual([
      'jacob1', 'owner1', 'jacob1', 'owner1',
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
