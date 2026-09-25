import { describe, expect, it } from 'vitest';
import {
  MAX_PRACTICE_TURNS,
  MAX_REP_CHARS,
  PERSONAS,
  buildFeedbackPrompt,
  parsePracticeHistory,
  parseScore,
  practiceCustomer,
  splitEnd,
} from './practice';

// Practice's pure pieces: one seed is one homeowner (page and server agree),
// the end marker, the coach's score line, and what transcript the route accepts.

describe('practiceCustomer', () => {
  it('is the same homeowner for the same persona and seed, and varies across seeds', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
    for (const seed of seeds) expect(practiceCustomer('price-shopper', seed)).toEqual(practiceCustomer('price-shopper', seed));
    const customers = seeds.map((seed) => practiceCustomer('price-shopper', seed));
    expect(new Set(customers.map((c) => c.name)).size).toBeGreaterThan(5);
    expect(new Set(customers.map((c) => c.bill)).size).toBeGreaterThan(5);
    const [low, high] = PERSONAS.find((p) => p.id === 'price-shopper')!.bill;
    for (const c of customers) {
      expect(c.persona.id).toBe('price-shopper');
      expect(c.bill).toBeGreaterThanOrEqual(low);
      expect(c.bill).toBeLessThanOrEqual(high);
    }
  });

  it('"surprise" draws the persona from the seed: fixed per seed, spread across seeds', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i * 104729 + 3);
    for (const seed of seeds) expect(practiceCustomer('surprise', seed).persona.id).toBe(practiceCustomer('surprise', seed).persona.id);
    expect(new Set(seeds.map((seed) => practiceCustomer('surprise', seed).persona.id)).size).toBe(PERSONAS.length);
  });

  it('tells the coach the AT&T Fiber homeowner should not buy', () => {
    expect(buildFeedbackPrompt([], practiceCustomer('att-fiber', 1))).toContain('should NOT buy');
    expect(buildFeedbackPrompt([], practiceCustomer('renter', 1))).not.toContain('should NOT buy');
  });
});

describe('splitEnd', () => {
  it('strips the marker wherever it lands and reports the end', () => {
    expect(splitEnd("Fine, let's do Thursday. [END]")).toEqual({ text: "Fine, let's do Thursday.", ended: true });
    expect(splitEnd('Not interested.[end]\n')).toEqual({ text: 'Not interested.', ended: true });
    expect(splitEnd('[ END ] Bye.')).toEqual({ text: 'Bye.', ended: true });
  });

  it('leaves a normal line alone and never returns an empty line', () => {
    expect(splitEnd('Who are you with?')).toEqual({ text: 'Who are you with?', ended: false });
    expect(splitEnd('[END]')).toEqual({ text: '(closes the door)', ended: true });
  });
});

describe('parseScore', () => {
  it('reads N from the Score line, 0 to 10', () => {
    expect(parseScore('Score: 7/10\nResult: no sale')).toBe(7);
    expect(parseScore('score : 10 / 10')).toBe(10);
    expect(parseScore('Score: 0/10')).toBe(0);
  });

  it('is null without a valid score', () => {
    expect(parseScore('Great job out there.')).toBeNull();
    expect(parseScore('Score: 11/10')).toBeNull();
    expect(parseScore('Score: 7/100')).toBeNull();
  });
});

describe('parsePracticeHistory', () => {
  it('accepts up to the turn cap and trims lines', () => {
    const turns = Array.from({ length: MAX_PRACTICE_TURNS }, (_, i) => ({
      role: i % 2 ? 'rep' : 'customer',
      text: ` line ${i} `,
    }));
    const parsed = parsePracticeHistory(turns);
    expect(parsed).toHaveLength(MAX_PRACTICE_TURNS);
    expect(parsed?.[0]).toEqual({ role: 'customer', text: 'line 0' });
    expect(parsePracticeHistory([...turns, { role: 'rep', text: 'one more' }])).toBeNull();
  });

  it('refuses a bad role, an empty line, an overlong rep line or a non-list', () => {
    expect(parsePracticeHistory([{ role: 'assistant', text: 'hi' }])).toBeNull();
    expect(parsePracticeHistory([{ role: 'rep', text: '   ' }])).toBeNull();
    expect(parsePracticeHistory([{ role: 'rep', text: 'x'.repeat(MAX_REP_CHARS + 1) }])).toBeNull();
    expect(parsePracticeHistory([{ role: 'rep', text: 'x'.repeat(MAX_REP_CHARS) }])).toHaveLength(1);
    expect(parsePracticeHistory('[]')).toBeNull();
    expect(parsePracticeHistory([])).toEqual([]);
  });
});
