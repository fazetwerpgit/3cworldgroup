import { describe, expect, it } from 'vitest';
import { localTimeLine, supportStatus } from './prompt';

// Instants in September (EDT, UTC-4).
const et = (iso: string) => new Date(`${iso}-04:00`);

describe('supportStatus', () => {
  it('is open inside the day window and names the close in both zones', () => {
    expect(supportStatus(et('2026-09-25T21:59'))).toBe(
      'Sales Support is OPEN right now, until 10pm Eastern (9pm Central) today.'
    );
  });

  it('closes at the close hour and opens the next day', () => {
    // Friday 10:00 PM -> Saturday 9am.
    expect(supportStatus(et('2026-09-25T22:00'))).toBe(
      'Sales Support is CLOSED right now; it opens Saturday at 9am Eastern (8am Central).'
    );
  });

  it('knows Saturday closes at 6 and Sunday opens at 10', () => {
    expect(supportStatus(et('2026-09-26T18:15'))).toBe(
      'Sales Support is CLOSED right now; it opens Sunday at 10am Eastern (9am Central).'
    );
    // Sunday 5:30 PM -> Monday 9am.
    expect(supportStatus(et('2026-09-27T17:30'))).toContain('opens Monday at 9am Eastern');
  });

  it('before opening says today', () => {
    expect(supportStatus(et('2026-09-28T08:50'))).toBe(
      'Sales Support is CLOSED right now; it opens today at 9am Eastern (8am Central).'
    );
  });
});


describe('localTimeLine', () => {
  it('gives an Iowa rep Central time and a Michigan rep Eastern', () => {
    expect(localTimeLine(et('2026-09-27T17:30'), 'Des Moines, IA')).toBe(
      "For them it's Sunday 4:30 PM (Central time). Say times in Central time."
    );
    expect(localTimeLine(et('2026-09-27T17:30'), 'Lansing, MI')).toContain('5:30 PM (Eastern time)');
  });
});