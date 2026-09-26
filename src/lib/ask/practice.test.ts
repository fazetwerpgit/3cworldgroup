import { describe, expect, it } from 'vitest';
import {
  MAX_PRACTICE_TURNS,
  MAX_REP_CHARS,
  PERSONAS,
  buildCustomerPrompt,
  buildFeedbackPrompt,
  drawPersona,
  enforceResult,
  feedbackSections,
  parsePracticeHistory,
  parseScore,
  practiceCustomer,
  practiceScreenCard,
  readCustomerReply,
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

  it('draws a surprise from a shuffle bag, never starting a new bag with the one just played', () => {
    let bag: unknown = [];
    let previous: string | null = null;
    let random = 0;
    const drawn: string[] = [];
    for (let i = 0; i < 90; i += 1) {
      const next = drawPersona('surprise', bag, previous, () => (random = (random * 9301 + 49297) % 233280) / 233280);
      drawn.push(next.persona);
      ({ bag } = next);
      previous = next.persona;
    }
    for (let round = 0; round < 10; round += 1) expect(new Set(drawn.slice(round * 9, round * 9 + 9)).size).toBe(9);
    for (let i = 1; i < drawn.length; i += 1) expect(drawn[i]).not.toBe(drawn[i - 1]);
  });

  it("takes an owner's pick and leaves the bag; drops junk from a stored bag", () => {
    expect(drawPersona('renter', ['elderly', 'skeptic'], null, Math.random)).toEqual({ persona: 'renter', bag: ['elderly', 'skeptic'] });
    expect(drawPersona('surprise', ['nope', 'elderly', 3], null, Math.random)).toEqual({ persona: 'elderly', bag: [] });
  });

  it('tells the coach whether the homeowner should buy and who ended it', () => {
    const att = buildFeedbackPrompt([], practiceCustomer('att-fiber', 1), 'rep');
    expect(att).toContain('should NOT buy');
    expect(att).toContain('The rep ended it');
    const renter = buildFeedbackPrompt([], practiceCustomer('renter', 1), 'homeowner');
    expect(renter).not.toContain('should NOT buy');
    expect(renter).toContain('Never "Walked away the right way" for this homeowner');
    expect(renter).toContain("The homeowner's last line ended it");
  });

  it('gives each door a fixed screen price: some beat the bill, the AT&T Fiber one does not', () => {
    const beats = PERSONAS.map((p) => p.screen.price < p.bill[0]);
    expect(beats.some(Boolean)).toBe(true);
    expect(PERSONAS.find((p) => p.id === 'att-fiber')!.screen.price).toBeGreaterThan(PERSONAS.find((p) => p.id === 'att-fiber')!.bill[1]);
    expect(practiceScreenCard(PERSONAS.find((p) => p.id === 'happy-spectrum')!)).toBe(
      'Order screen (practice): Fiber 500 — $65/mo with AutoPay. Real prices come from your order screen.'
    );
  });

  it('tells the homeowner their starting and current patience', () => {
    expect(buildCustomerPrompt(practiceCustomer('busy-parent', 1), 2)).toContain('you started at 3 and have 2 left');
    expect(buildCustomerPrompt(practiceCustomer('elderly', 1), 5)).toContain('you started at 5 and have 5 left');
  });
});

describe('readCustomerReply', () => {
  it('strips the patience tag, the end marker and stage directions', () => {
    expect(readCustomerReply("(wipes hands) Fine, let's do Thursday. [END] [P=2]", 3)).toEqual({
      text: "Fine, let's do Thursday.",
      ended: true,
      patience: 2,
    });
    expect(readCustomerReply('*sighs* Who are you with? (kids yelling behind you)[P=4]', 4)).toEqual({
      text: 'Who are you with?',
      ended: false,
      patience: 4,
    });
  });

  it('only lets patience go down: a missing or higher tag keeps it', () => {
    expect(readCustomerReply('Okay.', 3).patience).toBe(3);
    expect(readCustomerReply('Okay. [P=5]', 3).patience).toBe(3);
    expect(readCustomerReply('Okay. [P=1]', 3).patience).toBe(1);
  });

  it('closes the door at 0 even when the model kept talking', () => {
    expect(readCustomerReply('Yeah, probably. [P=0]', 1)).toEqual({
      text: "Look, I'm not interested. I've got to go.",
      ended: true,
      patience: 0,
    });
    // The model's own goodbye stands.
    expect(readCustomerReply('Not today, thanks. [END] [P=0]', 1).text).toBe('Not today, thanks.');
  });

  it('never shows an empty line', () => {
    expect(readCustomerReply('(closes the door) [END]', 2).text).toBe('No thanks. Have a good one.');
  });
});

describe('feedbackSections', () => {
  it('shows who it was as its own section', () => {
    expect(feedbackSections('This was: Renter\nScore: 5/10\nResult: No sale')).toEqual([
      { heading: 'This was', text: 'Renter', bullets: [] },
      { heading: 'Result', text: 'No sale', bullets: [] },
    ]);
  });

  it('drops the Score line and splits headings, inline text and bullets', () => {
    const text =
      'Score: 7/10\nResult: No sale\nWhat worked:\n- "Hi, I\'m with 3C."\n- **"What do you pay now?"**\nFix next time: Ask about the bill\nsooner.\nTry this line: "What\'s bugging you about it?"';
    expect(feedbackSections(text)).toEqual([
      { heading: 'Result', text: 'No sale', bullets: [] },
      { heading: 'What worked', text: '', bullets: ['"Hi, I\'m with 3C."', '"What do you pay now?"'] },
      { heading: 'Fix next time', text: 'Ask about the bill sooner.', bullets: [] },
      { heading: 'Try this line', text: '"What\'s bugging you about it?"', bullets: [] },
    ]);
  });

  it('keeps a stray line before the first heading', () => {
    expect(feedbackSections('Good energy.\n## what worked: the open')).toEqual([
      { heading: null, text: 'Good energy.', bullets: [] },
      { heading: 'What worked', text: 'the open', bullets: [] },
    ]);
  });
});

describe('enforceResult', () => {
  const feedback = 'Score: 3/10\nResult: Walked away the right way\nWhat worked:\n- "Hi"';

  it('turns "walked away" into No sale for a homeowner who could be sold', () => {
    expect(enforceResult(feedback, true)).toBe('Score: 3/10\nResult: No sale\nWhat worked:\n- "Hi"');
    expect(enforceResult('Score: 8/10\nResult: Sale', true)).toBe('Score: 8/10\nResult: Sale');
  });

  it('keeps it for the homeowner who should not buy', () => {
    expect(enforceResult(feedback, false)).toBe(feedback);
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
