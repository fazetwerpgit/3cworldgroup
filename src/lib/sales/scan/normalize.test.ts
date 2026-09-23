import { describe, expect, it } from 'vitest';
import { cleanIsoDate, cleanOrderNumber, formatPhone, joinAddress, matchCarrier, matchPlanId, planTextMbps } from './normalize';

describe('matchCarrier', () => {
  it.each([
    ['T-Mobile Fiber', 'tfiber'],
    ['T-Fiber', 'tfiber'],
    ['TFiber Home Internet', 'tfiber'],
    ['AT&T Fiber', 'att'],
    ['AT & T', 'att'],
    ['Frontier Communications', 'frontier'],
    ['Xfinity', 'xfinity'],
    ['Comcast Business', 'xfinity'],
    ['Spectrum', null],
    ['', null],
  ])('%s → %s', (text, company) => expect(matchCarrier(text)).toBe(company));
});

describe('planTextMbps / matchPlanId', () => {
  it.each([
    ['Fiber 1 Gig', 1000],
    ['2 GIG', 2000],
    ['Internet 1000', 1000],
    ['Fiber 500', 500],
    ['300 Mbps', 300],
    ['Gigabit', 1000],
    ['Fiber Internet', null],
  ])('%s → %s Mbps', (text, mbps) => expect(planTextMbps(text)).toBe(mbps));

  it('picks the one internet plan of that company at that speed', () => {
    expect(matchPlanId('tfiber', 'Fiber 2 Gig')).toBe('tfiber-2gig');
    expect(matchPlanId('tfiber', 'Fiber 300')).toBe('tfiber-300');
    expect(matchPlanId('att', 'AT&T Internet 1000')).toBe('att-1gig');
    expect(matchPlanId('frontier', 'Fiber 5 Gig')).toBe('frontier-5gig');
  });

  it('leaves the plan empty with no speed or no plan at that speed', () => {
    expect(matchPlanId('tfiber', 'Fiber Internet')).toBeNull();
    expect(matchPlanId('xfinity', 'Xfinity 300')).toBeNull();
    expect(matchPlanId('tfiber', undefined)).toBeNull();
  });
});

describe('field cleanup', () => {
  it('formats a 10-digit US phone and drops anything else', () => {
    expect(formatPhone('+1 512.555.0142')).toBe('(512) 555-0142');
    expect(formatPhone('555-0142')).toBeNull();
  });

  it('joins the address into the one line the form takes', () => {
    expect(joinAddress({ street: '9 Oak St', unit: '', city: 'Waco', state: 'tx', zip: '76701', confidence: 'high' })).toBe(
      '9 Oak St, Waco, TX 76701'
    );
    expect(joinAddress({ street: '9 Oak St Apt 2', unit: 'Apt 2', city: 'Waco', state: 'TX', zip: '', confidence: 'high' })).toBe(
      '9 Oak St Apt 2, Waco, TX'
    );
  });

  it('keeps only real calendar days', () => {
    expect(cleanIsoDate('2026-10-02')).toBe('2026-10-02');
    expect(cleanIsoDate('2026-02-30')).toBeNull();
    expect(cleanIsoDate('10/02/2026')).toBeNull();
  });

  it('strips an order label and needs a digit', () => {
    expect(cleanOrderNumber('Order #: TF-100234')).toBe('TF-100234');
    expect(cleanOrderNumber('#A12')).toBe('A12');
    expect(cleanOrderNumber('Pending')).toBeNull();
  });
});
