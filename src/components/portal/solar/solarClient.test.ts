import { describe, expect, it } from 'vitest';
import {
  CLIENT_ID_PATTERN,
  EMPTY_LEAD,
  formatSlotLong,
  formatSlotTime,
  formatWholeDollars,
  groupSlotsByDay,
  hasSeveralConsultants,
  newDeckClientId,
  validateLead,
  type SolarSlot,
} from './solarClient';
import { futureValue } from '@/lib/solar/calc';

const slot = (start: string, uid = 'owner', name = 'Owner'): SolarSlot => ({
  consultantUid: uid,
  name,
  start,
  end: new Date(Date.parse(start) + 3_600_000).toISOString(),
});

describe('solar deck helpers', () => {
  it('shows the calculator total in whole dollars', () => {
    expect(formatWholeDollars(futureValue(150).total)).toBe('$88,218');
    expect(formatWholeDollars(futureValue(250).total)).toBe('$147,030');
    expect(formatWholeDollars(NaN)).toBe('$0');
  });

  it('groups slots by Pacific day, in time order', () => {
    // 2026-10-21T04:00Z is 9 PM on Oct 20 in Los Angeles (PDT, UTC-7).
    const days = groupSlotsByDay([
      slot('2026-10-21T16:00:00.000Z'),
      slot('2026-10-21T04:00:00.000Z'),
      slot('2026-10-20T15:00:00.000Z'),
    ]);
    expect(days.map((d) => d.key)).toEqual(['2026-10-20', '2026-10-21']);
    expect(days[0].slots.map((s) => formatSlotTime(s.start))).toEqual(['8:00 AM', '9:00 PM']);
    expect(days[0].label).toBe('Tuesday, Oct 20');
    expect(formatSlotLong('2026-10-21T16:00:00.000Z')).toBe('Wednesday, Oct 21 at 9:00 AM PT');
  });

  it('names consultants only when there is more than one', () => {
    expect(hasSeveralConsultants([slot('2026-10-20T15:00:00Z'), slot('2026-10-20T16:00:00Z')])).toBe(false);
    expect(hasSeveralConsultants([slot('2026-10-20T15:00:00Z'), slot('2026-10-20T15:00:00Z', 'j', 'Jacob')])).toBe(true);
  });

  it('makes a clientId the API accepts', () => {
    const id = newDeckClientId();
    expect(CLIENT_ID_PATTERN.test(id)).toBe(true);
    expect(newDeckClientId()).not.toBe(id);
  });

  it('validates the lead form inline', () => {
    expect(Object.keys(validateLead(EMPTY_LEAD)).sort()).toEqual(
      ['address', 'city', 'first', 'last', 'phone', 'state', 'zip'].sort()
    );
    const ok = {
      first: 'Ana', last: 'Ruiz', address: '1 Main St', city: 'Fresno', state: 'CA',
      zip: '93701', phone: '(559) 555-0100', email: '',
    };
    expect(validateLead(ok)).toEqual({});
    expect(validateLead({ ...ok, email: 'nope' })).toEqual({ email: 'Check the email' });
  });
});
