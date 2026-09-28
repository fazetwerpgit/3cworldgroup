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
  nextPatience,
  priceNote,
  feedbackProblem,
  voicePool,
  VOICE_BOOK,
  OUT_OF_PATIENCE,
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

  it('draws a voice from the persona\'s pool, a name to match its gender, and one or two of its details', () => {
    for (const persona of PERSONAS) {
      const pool = voicePool(persona);
      expect(pool.length).toBeGreaterThan(1);
      for (let seed = 1; seed < 200; seed += 7) {
        const customer = practiceCustomer(persona.id, seed);
        expect(pool).toContain(customer.ttsVoice);
        expect(customer.gender).toBe(VOICE_BOOK[customer.ttsVoice].gender);
        expect(customer.style).toBe(persona.style[customer.gender]);
        expect(customer.details.length).toBeGreaterThanOrEqual(1);
        expect(customer.details.length).toBeLessThanOrEqual(2);
        expect(new Set(customer.details).size).toBe(customer.details.length);
        for (const detail of customer.details) expect(persona.details).toContain(detail);
        if (persona.providers) expect(persona.providers).toContain(customer.provider);
      }
    }
  });

  it('gives the older homeowner only older voices, and busy parents both moms and dads', () => {
    const elderly = PERSONAS.find((p) => p.id === 'elderly')!;
    for (const voice of voicePool(elderly)) expect(VOICE_BOOK[voice].age).toBe('older');
    const parents = new Set(Array.from({ length: 60 }, (_, seed) => practiceCustomer('busy-parent', seed).gender));
    expect(parents).toEqual(new Set(['f', 'm']));
  });
});

describe('buildCustomerPrompt', () => {
  it('tells the homeowner how thin the server-kept patience is, never a number to maintain', () => {
    const customer = practiceCustomer('busy-parent', 1);
    expect(buildCustomerPrompt(customer, 3)).toContain('Your patience is full');
    expect(buildCustomerPrompt(customer, 2)).toContain('Your patience is wearing thin');
    expect(buildCustomerPrompt(customer, 1)).toContain('almost gone');
    expect(buildCustomerPrompt(customer, 3)).not.toMatch(/\[P=/);
  });
});

describe('readCustomerReply', () => {
  it('moves patience by the reported event: OK keeps, WEAK takes 1, LIE halves then takes 1, ABUSE empties', () => {
    expect(readCustomerReply('Sure, go on. [OK]', 5).patience).toBe(5);
    expect(readCustomerReply('I said no. [WEAK]', 5).patience).toBe(4);
    expect(readCustomerReply('Free? Come on. [LIE]', 5).patience).toBe(1);
    expect(readCustomerReply('Free? Come on. [LIE]', 3).patience).toBe(0);
    expect(nextPatience(1, 'weak')).toBe(0);
    expect(nextPatience(0, 'weak')).toBe(0);
  });

  it('counts a missing or unknown tag as weak, and never scores the knock', () => {
    expect(readCustomerReply('Okay.', 3)).toMatchObject({ patience: 2, event: 'weak' });
    expect(readCustomerReply('Okay. [MAYBE]', 3).patience).toBe(2);
    expect(readCustomerReply('Old tag. [P=5]', 3).patience).toBe(2);
    expect(readCustomerReply('Hi, can I help you?', 3, false)).toMatchObject({ patience: 3, event: null, ended: false });
  });

  it('closes the door on abuse, keeping what the homeowner said', () => {
    expect(readCustomerReply('Excuse me? No. [ABUSE]', 4)).toEqual({
      text: "Excuse me? No. We're done here.",
      ended: true,
      patience: 0,
      event: 'abuse',
    });
  });

  it('ends on a plain goodbye even without [END]', () => {
    expect(readCustomerReply("I'm good, thanks. Have a nice day. [WEAK]", 3)).toMatchObject({ ended: true, patience: 2 });
    expect(readCustomerReply("I'm gonna shut the door now. [WEAK]", 3).ended).toBe(true);
    expect(readCustomerReply('Goodnight.', 3).ended).toBe(true);
    expect(readCustomerReply('Who are you with? [OK]', 3).ended).toBe(false);
    expect(readCustomerReply('Alright, Saturday works. Let\'s do it. [OK] [END]', 3).ended).toBe(true);
  });

  it('at 0 keeps a goodbye but turns anything else, even a yes, into the out-of-patience line', () => {
    expect(readCustomerReply('Yeah, probably. [WEAK]', 1)).toMatchObject({ text: OUT_OF_PATIENCE, ended: true, patience: 0 });
    expect(readCustomerReply('Sure, sign me up. [WEAK] [END]', 1).text).toBe(OUT_OF_PATIENCE);
    expect(readCustomerReply('Not today. Have a good one. [WEAK]', 1).text).toBe('Not today. Have a good one.');
  });

  it('strips tags and stage directions, and never shows an empty line', () => {
    expect(readCustomerReply('(wipes hands) Who are you with? *sighs* [OK]', 3).text).toBe('Who are you with?');
    expect(readCustomerReply('(closes the door) [END] [OK]', 2).text).toBe('No thanks. Have a good one.');
  });
});

describe('priceNote', () => {
  const customer = practiceCustomer('tmobile-customer', 7);
  const card = { role: 'screen' as const, text: 'card' };
  const hi = { role: 'customer' as const, text: 'Hi.' };

  it('flags a price that is not the card, or any price before the card', () => {
    expect(priceNote([hi, card, { role: 'rep', text: 'It says $45 a month with AutoPay.' }], customer)).toBe(
      '[Note only you know: the rep just said $45, but the screen they showed you said $60.]'
    );
    expect(priceNote([hi, { role: 'rep', text: "It's 45 dollars." }], customer)).toBe(
      '[Note only you know: the rep just quoted $45 without showing you any screen.]'
    );
  });

  it('is quiet for the card price, the homeowner\'s own bill, plan names, and older lines', () => {
    expect(priceNote([hi, card, { role: 'rep', text: 'Fiber 1 Gig, $60 with AutoPay.' }], customer)).toBeNull();
    expect(priceNote([hi, { role: 'rep', text: `So you pay $${customer.bill} now?` }], customer)).toBeNull();
    expect(priceNote([hi, { role: 'rep', text: 'Fiber 500 or 1 Gig, 300 Mbps.' }], customer)).toBeNull();
    expect(priceNote([{ role: 'rep', text: '$45!' }, hi, { role: 'rep', text: 'Anyway.' }], customer)).toBeNull();
  });
});

describe('feedbackProblem', () => {
  const good = 'Score: 6/10\nResult: No sale\nWhat worked:\n- "Who\'s your internet with?"\nFix next time: Ask about the bill.\nTry this line: "What bugs you most about it?"';

  it('passes the exact shape', () => {
    expect(feedbackProblem(good)).toBeNull();
  });

  it('catches an extra section, a missing one, a bad Result, a price in the Try line', () => {
    expect(feedbackProblem(`${good}\nHonesty flags: never promise that.`)).toMatch(/extra/);
    expect(feedbackProblem(good.replace(/Fix next time: .*\n/, ''))).toMatch(/missing|out of order/);
    expect(feedbackProblem(good.replace('No sale', 'Maybe'))).toMatch(/Result/);
    expect(feedbackProblem(good.replace('What bugs you most about it?', 'It\'s $60 a month'))).toMatch(/dollar/);
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
