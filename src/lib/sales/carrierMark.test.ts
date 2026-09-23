import { describe, expect, it } from 'vitest';
import { carrierMark, planWithoutCarrier } from './carrierMark';

describe('carrierMark', () => {
  it('uses the short wordmark for T-Fiber and the channel name otherwise', () => {
    expect(carrierMark('tfiber')).toBe('T-Fiber');
    expect(carrierMark('att')).toBe('AT&T');
    expect(carrierMark('frontier')).toBe('Frontier');
  });

  it('is empty for an unknown or missing id', () => {
    expect(carrierMark('nope')).toBe('');
    expect(carrierMark(undefined)).toBe('');
  });
});

describe('planWithoutCarrier', () => {
  it('drops a leading carrier name', () => {
    expect(planWithoutCarrier('TFiber 1 Gig', 'tfiber')).toBe('1 Gig');
    expect(planWithoutCarrier('AT&T Internet 300', 'att')).toBe('300');
    expect(planWithoutCarrier('Frontier Fiber 500', 'frontier')).toBe('Fiber 500');
  });

  it('keeps the plan when nothing would be left or the carrier is unknown', () => {
    expect(planWithoutCarrier('TFiber', 'tfiber')).toBe('TFiber');
    expect(planWithoutCarrier('1 Gig +1', undefined)).toBe('1 Gig +1');
  });
});
