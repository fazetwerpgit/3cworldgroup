import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_ID_PATTERN,
  EMPTY_LEAD,
  formatSlotLong,
  formatSlotTime,
  bookTime,
  formatWholeDollars,
  groupSlotsByDay,
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
    expect(days[0].times.map((t) => formatSlotTime(t.start))).toEqual(['8:00 AM', '9:00 PM']);
    expect(days[0].label).toBe('Tuesday, Oct 20');
    expect(formatSlotLong('2026-10-21T16:00:00.000Z')).toBe('Wednesday, Oct 21 at 9:00 AM PT');
  });

  it('shows each time once, keeping the server preference order of consultants', () => {
    const days = groupSlotsByDay([
      slot('2026-10-20T15:00:00.000Z', 'own', 'Owner'),
      slot('2026-10-20T15:00:00.000Z', 'jac', 'Jacob'),
      slot('2026-10-20T16:00:00.000Z', 'jac', 'Jacob'),
    ]);
    expect(days[0].times.map((t) => [t.start, t.candidates.map((c) => c.consultantUid)])).toEqual([
      ['2026-10-20T15:00:00.000Z', ['own', 'jac']],
      ['2026-10-20T16:00:00.000Z', ['jac']],
    ]);
  });

  describe('bookTime', () => {
    const time = {
      start: '2026-10-20T15:00:00.000Z',
      candidates: [slot('2026-10-20T15:00:00.000Z', 'own', 'Owner'), slot('2026-10-20T15:00:00.000Z', 'jac', 'Jacob')],
    };
    const taken = { ok: false as const, status: 409, error: 'slot_taken' };

    it('books the first free consultant', async () => {
      const book = vi.fn(async () => ({ ok: true as const, data: { id: 'b1' } }));
      expect(await bookTime(time, 'L', 'virtual', book)).toEqual({ ok: true, id: 'b1', slot: time.candidates[0] });
      expect(book).toHaveBeenCalledTimes(1);
      expect(book).toHaveBeenCalledWith({ leadId: 'L', mode: 'virtual', consultantUid: 'own', start: time.start });
    });

    it('retries once with the next consultant on a 409', async () => {
      const book = vi.fn().mockResolvedValueOnce(taken).mockResolvedValueOnce({ ok: true, data: { id: 'b2' } });
      const res = await bookTime(time, 'L', 'virtual', book);
      expect(res).toEqual({ ok: true, id: 'b2', slot: time.candidates[1] });
      expect(book.mock.calls[1][0].consultantUid).toBe('jac');
    });

    it('reports taken after the retry, or right away with one consultant', async () => {
      const book = vi.fn().mockResolvedValue(taken);
      expect(await bookTime(time, 'L', 'virtual', book)).toEqual({ ok: false, taken: true, error: 'slot_taken' });
      expect(book).toHaveBeenCalledTimes(2);
      book.mockClear();
      expect((await bookTime({ ...time, candidates: [time.candidates[0]] }, 'L', 'virtual', book)).ok).toBe(false);
      expect(book).toHaveBeenCalledTimes(1);
    });

    it('does not retry other errors', async () => {
      const book = vi.fn().mockResolvedValue({ ok: false, status: 500, error: 'Failed to book' });
      expect(await bookTime(time, 'L', 'virtual', book)).toEqual({ ok: false, taken: false, error: 'Failed to book' });
      expect(book).toHaveBeenCalledTimes(1);
    });
  });

  it('makes a clientId the API accepts', () => {
    const id = newDeckClientId();
    expect(CLIENT_ID_PATTERN.test(id)).toBe(true);
    expect(newDeckClientId()).not.toBe(id);
  });

  it('validates the lead form inline', () => {
    expect(Object.keys(validateLead(EMPTY_LEAD)).sort()).toEqual(
      ['address', 'city', 'email', 'first', 'last', 'phone', 'state', 'zip'].sort()
    );
    const ok = {
      first: 'Ana', last: 'Ruiz', address: '1 Main St', city: 'Fresno', state: 'CA',
      zip: '93701', phone: '(559) 555-0100', email: 'ana@example.com',
    };
    expect(validateLead(ok)).toEqual({});
    expect(validateLead({ ...ok, email: 'nope' })).toEqual({ email: 'Check the email' });
    expect(validateLead({ ...ok, email: '  ' })).toEqual({ email: 'Add an email' });
  });
});
