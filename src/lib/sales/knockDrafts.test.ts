import { describe, expect, it } from 'vitest';
import { DRAFT_PLANS, draftDocId, isDraftId, parseDraftInput, serializeDraft } from './knockDrafts';

const NOW = Date.UTC(2026, 9, 8, 18);
const base = { clientId: 'sold-abc_123', address: '1 Main St, Springfield, MO', soldAt: NOW - 60_000, source: 'knock' };

describe('parseDraftInput', () => {
  it('accepts the minimal Sold and leaves name and plan unset (not cleared)', () => {
    const parsed = parseDraftInput(base, NOW);
    expect(parsed).toEqual({ ok: true, draft: { ...base, source: 'knock' } });
    if (parsed.ok) {
      expect('customerName' in parsed.draft).toBe(false);
      expect('planId' in parsed.draft).toBe(false);
    }
  });

  it('keeps an explicit null so a repeat can clear name and plan', () => {
    const parsed = parseDraftInput({ ...base, customerName: null, planId: null }, NOW);
    expect(parsed.ok && parsed.draft.customerName).toBeNull();
    expect(parsed.ok && parsed.draft.planId).toBeNull();
  });

  it('trims the address and name, and a blank name reads as none', () => {
    const parsed = parseDraftInput({ ...base, address: '  1  Main St ', customerName: '   ' }, NOW);
    expect(parsed.ok && parsed.draft.address).toBe('1 Main St');
    expect(parsed.ok && parsed.draft.customerName).toBeNull();
  });

  it('takes an internet plan and the optional ids', () => {
    const parsed = parseDraftInput(
      { ...base, customerName: 'Jane Doe', planId: 'tfiber-1gig', houseId: 'h1', knockId: 'k1', campaignId: 'c1' },
      NOW
    );
    expect(parsed).toEqual({
      ok: true,
      draft: { ...base, customerName: 'Jane Doe', planId: 'tfiber-1gig', houseId: 'h1', knockId: 'k1', campaignId: 'c1' },
    });
  });

  it.each([
    [{ ...base, clientId: '' }, 'Invalid clientId'],
    [{ ...base, clientId: 'a/b' }, 'Invalid clientId'],
    [{ ...base, clientId: 'x'.repeat(129) }, 'Invalid clientId'],
    [{ ...base, source: 'web' }, "source must be 'knock'"],
    [{ ...base, address: '  ' }, 'Missing required field: address'],
    [{ ...base, address: 'x'.repeat(301) }, 'Address is too long'],
    [{ ...base, soldAt: '2026-10-08' }, 'soldAt must be epoch milliseconds'],
    [{ ...base, soldAt: Number.NaN }, 'soldAt must be epoch milliseconds'],
    [{ ...base, soldAt: NOW + 2 * 24 * 60 * 60 * 1000 }, 'soldAt is out of range'],
    [{ ...base, soldAt: Date.UTC(2020, 0, 1) }, 'soldAt is out of range'],
    [{ ...base, customerName: 42 }, 'Invalid customerName'],
    [{ ...base, customerName: 'x'.repeat(121) }, 'Customer name is too long'],
    [{ ...base, planId: 'nope' }, 'Unknown planId'],
    [{ ...base, planId: 'xfinity-tv' }, 'Unknown planId'],
    [{ ...base, houseId: 'a b' }, 'Invalid houseId'],
    [{ ...base, knockId: 7 }, 'Invalid knockId'],
    [null, 'Invalid request body'],
    [[base], 'Invalid request body'],
  ])('rejects %j', (body, error) => {
    expect(parseDraftInput(body, NOW)).toEqual({ ok: false, error });
  });
});

describe('draft ids', () => {
  it('builds one id per rep and Sold, in the shape isDraftId accepts', () => {
    const id = draftDocId('uid123', 'sold-1');
    expect(id).toBe('uid123_sold-1');
    expect(isDraftId(id)).toBe(true);
    expect(isDraftId('a/b')).toBe(false);
    expect(isDraftId('')).toBe(false);
    expect(isDraftId(5)).toBe(false);
  });

  it('offers only internet plans to a draft', () => {
    expect(DRAFT_PLANS.length).toBeGreaterThan(0);
    expect(DRAFT_PLANS.every((plan) => plan.category !== 'extra')).toBe(true);
  });
});

describe('serializeDraft', () => {
  it('turns stored timestamps into epoch ms and missing text into null', () => {
    const soldAt = new Date(NOW);
    const draft = serializeDraft('d1', {
      clientId: 'c1',
      address: '1 Main St',
      soldAt: { toDate: () => soldAt },
      customerName: '',
      planId: 'tfiber-300',
      status: 'open',
      createdAt: soldAt,
    });
    expect(draft).toEqual({
      id: 'd1',
      clientId: 'c1',
      address: '1 Main St',
      soldAt: NOW,
      customerName: null,
      planId: 'tfiber-300',
      status: 'open',
      source: 'knock',
      houseId: null,
      knockId: null,
      campaignId: null,
      createdAt: NOW,
      updatedAt: null,
    });
  });
});
