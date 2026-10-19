import { describe, expect, it } from 'vitest';
import { parseAvailability } from './availability';

const base = { tz: 'America/Chicago', slotMin: 60 };

describe('parseAvailability', () => {
  it('accepts hours, pads times, sorts by day and fills a missing mode', () => {
    const parsed = parseAvailability({
      ...base,
      modes: { virtual: [{ day: 3, start: '9:00', end: '17:00' }, { day: 1, start: '10:00', end: '12:30' }] },
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        tz: 'America/Chicago',
        slotMin: 60,
        modes: {
          virtual: [{ day: 1, start: '10:00', end: '12:30' }, { day: 3, start: '09:00', end: '17:00' }],
          in_person: [],
        },
      },
    });
  });

  it('accepts a consultant with no hours at all', () => {
    expect(parseAvailability({ ...base, modes: { virtual: [], in_person: [] } }).ok).toBe(true);
    expect(parseAvailability(base).ok).toBe(true);
  });

  it('drops unknown fields instead of passing them through', () => {
    const parsed = parseAvailability({ ...base, name: 'Mallory', consultantUid: 'x', modes: { phone: [{ day: 1 }] } });
    expect(parsed).toEqual({ ok: true, value: { ...base, modes: { virtual: [], in_person: [] } } });
  });

  it.each([
    [null, 'Invalid hours'],
    ['hours', 'Invalid hours'],
    [{ ...base, tz: 'Europe/London' }, 'Pick a time zone'],
    [{ ...base, tz: undefined }, 'Pick a time zone'],
    [{ ...base, slotMin: 45 }, 'Slot length must be 30, 60 or 90 minutes'],
    [{ ...base, slotMin: '60' }, 'Slot length must be 30, 60 or 90 minutes'],
    [{ ...base, modes: [] }, 'Invalid hours'],
    [{ ...base, modes: { virtual: 'Mon 9-5' } }, 'Invalid hours'],
    [{ ...base, modes: { virtual: [null] } }, 'Invalid hours'],
    [{ ...base, modes: { virtual: [{ day: 7, start: '09:00', end: '17:00' }] } }, 'Invalid day'],
    [{ ...base, modes: { virtual: [{ day: 1.5, start: '09:00', end: '17:00' }] } }, 'Invalid day'],
    [{ ...base, modes: { virtual: [{ day: 1, start: '9am', end: '17:00' }] } }, 'Monday has an invalid time'],
    [{ ...base, modes: { virtual: [{ day: 1, start: '09:00', end: '25:00' }] } }, 'Monday has an invalid time'],
    [{ ...base, modes: { in_person: [{ day: 2, start: '17:00', end: '09:00' }] } }, 'Tuesday ends before one 60-minute slot fits'],
    [{ ...base, modes: { in_person: [{ day: 2, start: '09:00', end: '09:45' }] } }, 'Tuesday ends before one 60-minute slot fits'],
    [
      { ...base, modes: { virtual: [{ day: 0, start: '09:00', end: '12:00' }, { day: 0, start: '13:00', end: '17:00' }] } },
      'Sunday is listed twice',
    ],
  ])('rejects %j', (input, error) => {
    expect(parseAvailability(input)).toEqual({ ok: false, error });
  });

  it('measures the shortest window against the chosen slot length', () => {
    const window = { day: 5, start: '09:00', end: '09:30' };
    expect(parseAvailability({ ...base, slotMin: 30, modes: { virtual: [window] } }).ok).toBe(true);
    expect(parseAvailability({ ...base, slotMin: 90, modes: { virtual: [{ ...window, end: '10:00' }] } })).toEqual({
      ok: false,
      error: 'Friday ends before one 90-minute slot fits',
    });
  });

  it('rejects more than seven windows in a mode', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ day: i % 7, start: '09:00', end: '17:00' }));
    expect(parseAvailability({ ...base, modes: { virtual: many } })).toEqual({ ok: false, error: 'Invalid hours' });
  });
});
