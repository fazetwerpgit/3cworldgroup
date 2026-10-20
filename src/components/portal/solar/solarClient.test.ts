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
  slotsInWindow,
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

    it("sends the customer's zone and keeps the one the server stored", async () => {
      const book = vi.fn(async () => ({ ok: true as const, data: { id: 'b1', customerTz: 'America/New_York' } }));
      const res = await bookTime(time, 'L', 'virtual', book, 'America/New_York');
      expect(book).toHaveBeenCalledWith({
        leadId: 'L', mode: 'virtual', consultantUid: 'own', start: time.start, customerTz: 'America/New_York',
      });
      expect(res).toEqual({ ok: true, id: 'b1', slot: time.candidates[0], customerTz: 'America/New_York' });
    });

    it('words a slot the server no longer offers (past the window) for the rep', async () => {
      const book = vi.fn().mockResolvedValue({ ok: false, status: 400, error: 'slot_unavailable' });
      const res = await bookTime(time, 'L', 'virtual', book);
      expect(res).toMatchObject({ ok: false, taken: false });
      expect(!res.ok && res.error).toContain('within the next 14 days');
    });

    it('does not retry other errors', async () => {
      const book = vi.fn().mockResolvedValue({ ok: false, status: 500, error: 'Failed to book' });
      expect(await bookTime(time, 'L', 'virtual', book)).toEqual({ ok: false, taken: false, error: 'Failed to book' });
      expect(book).toHaveBeenCalledTimes(1);
    });
  });

  describe("in the customer's zone", () => {
    it('groups and shows times in Eastern for a Florida customer', () => {
      // 04:00Z Oct 21 is 9 PM Oct 20 Pacific but 12 AM Oct 21 Eastern.
      const days = groupSlotsByDay(
        [slot('2026-10-21T04:00:00.000Z'), slot('2026-10-20T15:00:00.000Z')],
        'America/New_York'
      );
      expect(days.map((d) => d.key)).toEqual(['2026-10-20', '2026-10-21']);
      expect(days[0].times.map((t) => formatSlotTime(t.start, 'America/New_York'))).toEqual(['11:00 AM']);
      expect(days[1].label).toBe('Wednesday, Oct 21');
      expect(formatSlotLong('2026-10-20T15:00:00.000Z', 'America/New_York')).toBe('Tuesday, Oct 20 at 11:00 AM ET');
      expect(formatSlotLong('2026-10-20T15:00:00.000Z', 'America/Chicago')).toBe('Tuesday, Oct 20 at 10:00 AM CT');
    });

    it('keeps the same wall time across the fall-back change', () => {
      // 8 AM Pacific: 15:00Z on Oct 30 (PDT), 16:00Z on Nov 2 (PST).
      expect(formatSlotTime('2026-10-30T15:00:00.000Z', 'America/Los_Angeles')).toBe('8:00 AM');
      expect(formatSlotTime('2026-11-02T16:00:00.000Z', 'America/Los_Angeles')).toBe('8:00 AM');
      expect(formatSlotTime('2026-11-02T16:00:00.000Z', 'America/New_York')).toBe('11:00 AM');
    });
  });

  it('drops slots past the 14-day booking window', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const kept = slotsInWindow(
      [slot('2026-11-02T16:00:00.000Z'), slot('2026-11-03T00:00:00.000Z'), slot('2026-11-09T16:00:00.000Z')],
      now
    );
    expect(kept.map((x) => x.start)).toEqual(['2026-11-02T16:00:00.000Z']);
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
