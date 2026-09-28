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
  judgedEvent,
  lineToJudge,
  priceNote,
  feedbackProblem,
  voicePool,
  VOICE_BOOK,
  OUT_OF_PATIENCE,
  soundsLikeGoodbye,
  ABUSE_CLOSES,
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
  it('moves patience by the judged event: OK keeps, WEAK takes 1, LIE halves (rounded up) then takes 1, ABUSE empties', () => {
    expect(readCustomerReply('Sure, go on.', 5, 'ok').patience).toBe(5);
    expect(readCustomerReply('I said no.', 5, 'weak').patience).toBe(4);
    expect(readCustomerReply('Free? Come on.', 5, 'lie').patience).toBe(2);
    // A three-patience door survives one caught lie, barely.
    expect(nextPatience(3, 'lie')).toBe(1);
    expect(nextPatience(4, 'lie')).toBe(1);
    expect(nextPatience(1, 'lie')).toBe(0);
    expect(nextPatience(5, 'abuse')).toBe(0);
    expect(nextPatience(1, 'weak')).toBe(0);
    expect(nextPatience(0, 'weak')).toBe(0);
  });

  it('never scores the knock', () => {
    expect(readCustomerReply('Hi, can I help you?', 3, null)).toEqual({ text: 'Hi, can I help you?', ended: false, patience: 3 });
  });

  it('on abuse, replaces whatever the model wrote with one of the closes, differing by session', () => {
    const closes = [0, 1, 2, 3, 4].map((seed) => readCustomerReply('Excuse me? We\'re done here. [END]', 4, 'abuse', seed));
    for (const close of closes) {
      expect(close).toMatchObject({ ended: true, patience: 0 });
      expect(ABUSE_CLOSES).toContain(close.text);
    }
    expect(new Set(closes.map((close) => close.text)).size).toBe(ABUSE_CLOSES.length);
  });

  it('ends on a plain goodbye even without [END]', () => {
    expect(readCustomerReply("I'm good, thanks. Have a nice day.", 3, 'weak')).toMatchObject({ ended: true, patience: 2 });
    expect(readCustomerReply("I'm gonna shut the door now.", 3, 'weak').ended).toBe(true);
    expect(readCustomerReply('Goodnight.', 3, 'ok').ended).toBe(true);
    expect(readCustomerReply('Bye.', 3, 'ok').ended).toBe(true);
    expect(readCustomerReply("Look, I'm not interested.", 3, 'weak').ended).toBe(true);
    expect(readCustomerReply('I think I\'m okay, thanks. You have a good afternoon now.', 3, 'ok').ended).toBe(true);
    expect(readCustomerReply('Who are you with?', 3, 'ok').ended).toBe(false);
    expect(readCustomerReply("Alright, Saturday works. Let's do it. [END]", 3, 'ok').ended).toBe(true);
  });

  it('ends on a longer last sentence that opens with a closing', () => {
    expect(soundsLikeGoodbye('Have a good one, and good luck out there with the rest of the street today.')).toBe(true);
    expect(soundsLikeGoodbye('Thanks, appreciate it. Okay, take care, and good luck with the rest of your day.')).toBe(true);
    expect(soundsLikeGoodbye("I'm not interested, but my wife might be.")).toBe(false);
    expect(soundsLikeGoodbye('Have a good one, but first, what does the install look like?')).toBe(false);
  });

  it('never ends on a goodbye word inside a longer line or a question', () => {
    for (const line of [
      "I'm not closing the door on it, I just need to ask my wife.",
      'Honestly I\'d love to say bye to Xfinity. What\'s the next step?',
      "Good night and day difference if it's real.",
      'Would you guys take care of returning the Spectrum box?',
      'Bye-bye data caps, huh?',
      "Okay, but who's gonna take care of the setup?",
    ]) {
      expect(soundsLikeGoodbye(line)).toBe(false);
      expect(readCustomerReply(line, 4, 'ok').ended).toBe(false);
    }
  });

  it('at 0 keeps a goodbye but turns anything else, even a yes, into the out-of-patience line', () => {
    expect(readCustomerReply('Yeah, probably.', 1, 'weak')).toEqual({ text: OUT_OF_PATIENCE, ended: true, patience: 0 });
    expect(readCustomerReply('Sure, sign me up. [END]', 1, 'weak').text).toBe(OUT_OF_PATIENCE);
    expect(readCustomerReply('Not today. Have a good one.', 1, 'weak').text).toBe('Not today. Have a good one.');
  });

  it('strips tags and stage directions, and never shows an empty line', () => {
    expect(readCustomerReply('(wipes hands) Who are you with? *sighs* [OK] [P=3]', 3, 'ok').text).toBe('Who are you with?');
    expect(readCustomerReply('(closes the door) [END]', 2, 'ok').text).toBe('No thanks. Have a good one.');
  });
});

describe('the line judge', () => {
  it('reads one word; anything else counts as weak', () => {
    expect(judgedEvent('OK')).toBe('ok');
    expect(judgedEvent('lie.')).toBe('lie');
    expect(judgedEvent(' ABUSE\n')).toBe('abuse');
    expect(judgedEvent('Hmm, hard to say')).toBe('weak');
  });

  it('sees the homeowner\'s last words, the screen so far and only the rep\'s latest lines', () => {
    const customer = practiceCustomer('price-shopper', 42);
    const text = lineToJudge(
      [
        { role: 'customer', text: 'Hi.' },
        { role: 'rep', text: 'Old line.' },
        { role: 'customer', text: 'What does it cost?' },
        { role: 'screen', text: 'card' },
        { role: 'rep', text: "It's $45." },
      ],
      customer
    );
    expect(text).toContain('Earlier:\nHomeowner: Hi.\nRep: Old line.');
    expect(text).toContain('The homeowner just said: "What does it cost?"');
    expect(text).toContain('The price screen shown to the homeowner says $75 a month.');
    expect(text).toContain('(shows the homeowner the price screen)\n"It\'s $45."');
    expect(text.slice(text.indexOf('The rep now:'))).not.toContain('Old line.');
  });

  it('tells the judge when the door just opened, so an opener reads as one', () => {
    const text = lineToJudge(
      [
        { role: 'customer', text: "I'm kind of in the middle of something." },
        { role: 'rep', text: "Hi, I'm Jordan with 3C. T-Mobile Fiber just came to your street." },
      ],
      practiceCustomer('happy-spectrum', 1)
    );
    expect(text.startsWith('The homeowner just opened the door.')).toBe(true);
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
      "[Note only you know: the rep quoted $45 but hasn't shown you anything. You have no idea where that number comes from: ask them where it comes from before you react to it.]"
    );
  });

  it('is quiet for honest savings math against what the homeowner said, monthly or yearly', () => {
    const paid = { role: 'customer' as const, text: 'About $99 a month, and it keeps going up.' };
    const spectrum = practiceCustomer('happy-spectrum', 7);
    const shown = (line: string) => priceNote([paid, card, { role: 'rep', text: line }], spectrum);
    expect(shown('$65 with AutoPay against your $99, so about $34 less.')).toBeNull();
    expect(shown('That works out to around $400 a year.')).toBeNull();
    expect(shown('You\'d save about $35 a month.')).toBeNull();
    // Still caught: a made-up price, and savings talk before any screen.
    expect(shown('Really it\'s just $45 a month.')).toMatch(/said \$45/);
    expect(priceNote([paid, { role: 'rep', text: 'You\'d save $30 a month.' }], spectrum)).toMatch(/quoted \$30/);
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

  it('catches a time promise in the Try line', () => {
    expect(feedbackProblem(good.replace('What bugs you most about it?', 'Two minutes, tops. Want to see?'))).toMatch(/time promise/);
    expect(feedbackProblem(good.replace('What bugs you most about it?', 'It takes 5 mins to set up.'))).toMatch(/time promise/);
  });

  it('catches an extra section, a missing one, a bad Result, a price in the Try line', () => {
    expect(feedbackProblem(`${good}\nHonesty flags: never promise that.`)).toMatch(/extra/);
    expect(feedbackProblem(good.replace(/Fix next time: .*\n/, ''))).toMatch(/missing|out of order/);
    expect(feedbackProblem(good.replace('No sale', 'Maybe'))).toMatch(/Result/);
    expect(feedbackProblem(good.replace('What bugs you most about it?', 'It\'s $60 a month'))).toMatch(/dollar/);
    expect(feedbackProblem(good.replace('- "Who\'s your internet with?"', '- The standard opener landed fine.'))).toMatch(/quote/);
    expect(feedbackProblem(good.replace('- "Who\'s your internet with?"', '- Nothing worked here.'))).toBeNull();
  });

  it('asks for a retry past 130 words', () => {
    const padded = (words: number) => good.replace('Ask about the bill.', `Ask ${'more '.repeat(words)}about the bill.`);
    const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
    const at130 = padded(130 - count(good));
    expect(count(at130)).toBe(130);
    expect(feedbackProblem(at130)).toBeNull();
    expect(feedbackProblem(padded(131 - count(good)))).toBe('over 130 words');
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
