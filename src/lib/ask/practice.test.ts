import { describe, expect, it } from 'vitest';
import { parseSkills } from './practiceCoaching';
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
  enforceScore,
  aboutThem,
  isSelfHarm,
  NAMES,
  OLDER_NAMES,
  calendarNote,
  freshSeed,
  lieQuotes,
  screenForHomeowner,
  strayCoachSentences,
  transcriptProblem,
  screenBeatsBill,
  voicePool,
  VOICE_BOOK,
  OUT_OF_PATIENCE,
  soundsLikeGoodbye,
  unbackedClaims,
  stripSentences,
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
    const spectrum = buildFeedbackPrompt([], practiceCustomer('happy-spectrum', 1), 'homeowner');
    expect(spectrum).not.toContain('should NOT buy');
    expect(spectrum).toContain('Never "Walked away the right way" for this homeowner');
    expect(spectrum).toContain("The homeowner's last line ended it");
  });

  it("lets a rep walk away the right way when the screen doesn't really beat the bill, and tells the coach the rule", () => {
    // Price shopper, seed 1: $73 a month now, the screen shows $75.
    const close = practiceCustomer('price-shopper', 1);
    expect(screenBeatsBill(close)).toBe(false);
    const prompt = buildFeedbackPrompt([], close, 'rep');
    expect(prompt).toContain("The order screen for this door ($75/mo) is more than what the homeowner pays ($73)");
    expect(prompt).toContain('leave on a good note and move on');
    expect(prompt).not.toContain('Never "Walked away the right way"');
    // Seed 7: $85 against $75 is a real saving; the usual rule holds.
    expect(screenBeatsBill(practiceCustomer('price-shopper', 7))).toBe(true);
    expect(buildFeedbackPrompt([], practiceCustomer('price-shopper', 7), 'rep')).not.toContain("doesn't really beat");
  });

  it('asks the coach for the rep\'s name instead of a blank in the Try line', () => {
    expect(buildFeedbackPrompt([], practiceCustomer('skeptic', 1), 'rep', undefined, '', 'Casey')).toContain("The rep's first name: Casey");
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

  it('keeps a voice out of a tone where it read as the other gender', () => {
    const persona = (id: string) => PERSONAS.find((p) => p.id === id)!;
    expect(voicePool(persona('elderly'))).toContain('Pulcherrima');
    expect(voicePool(persona('happy-spectrum'))).not.toContain('Pulcherrima');
    expect(voicePool(persona('skeptic'))).not.toContain('Kore');
    expect(voicePool(persona('elderly'))).not.toContain('Vindemiatrix');
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
  const good = 'Score: 6/10\nResult: No sale\nSkills: Opener 7/10, Discovery 5/10, Objections 4/10, Close 3/10\nWhat worked:\n- "Who\'s your internet with?"\nFix next time: Ask about the bill.\nTry this line: "What bugs you most about it?"';

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
    // The Skills line doesn't count toward the 130.
    const count = (text: string) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('Skills:'))
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;
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

describe('unbackedClaims', () => {
  const turns = [
    { role: 'customer' as const, text: 'Hi, can I help you?' },
    { role: 'rep' as const, text: "Hi, I'm Toby with 3C. Who do you have for internet?" },
    { role: 'customer' as const, text: "Spectrum. We're happy with it, thanks." },
    { role: 'rep' as const, text: 'Totally fair. Has the bill gone up at all?' },
    { role: 'customer' as const, text: 'It has, twice this year.' },
  ];
  const card = (fix: string) =>
    `Score: 6/10\nResult: No sale\nWhat worked:\n- "Who do you have for internet?" opened it.\nFix next time: ${fix}\nTry this line: "What would fix that for you?"`;

  it('catches pain the homeowner never said, and quotes nobody said', () => {
    expect(unbackedClaims(card('They mentioned their work video calls freeze.'), turns)).toEqual(['They mentioned their work video calls freeze.']);
    expect(unbackedClaims(card('You said the bill crept up.'), turns)).toEqual(['You said the bill crept up.']);
    expect(unbackedClaims(card('She said "my calls drop all the time."'), turns)).toHaveLength(1);
    expect(unbackedClaims(card('Tie it to that.').replace('"Who do you have for internet?"', '"Fiber is way faster"'), turns)).toHaveLength(1);
  });

  it('lets through what was said, an answer to the rep\'s question, and the coach\'s own Try line', () => {
    expect(unbackedClaims(card('The homeowner mentioned the bill went up twice.'), turns)).toEqual([]);
    expect(unbackedClaims(card('When the homeowner said "It has, twice this year," tie fiber to that.'), turns)).toEqual([]);
    expect(unbackedClaims(card('You asked who they have for internet.'), turns)).toEqual([]);
  });

  it('never leaves a fragment behind: a Fix with a made-up sentence becomes an honest general line, a bullet goes whole', () => {
    const fb = card('Acknowledge it. They mentioned their work video calls freeze.');
    expect(stripSentences(fb, unbackedClaims(fb, turns))).toBe(
      card('Keep every claim to what the playbook backs, and keep asking about what bugs them.')
    );
    const two = 'What worked:\n- "Who do you have for internet?" opened it. They loved it.\n- "Has the bill gone up at all?" found the pain.\nFix next time: Ask sooner.';
    expect(stripSentences(two, ['They loved it.'])).toBe('What worked:\n- "Has the bill gone up at all?" found the pain.\nFix next time: Ask sooner.');
    expect(stripSentences('What worked:\n- "x y z" was great. Truly.\nFix next time: Ask.', ['Truly.'])).toBe(
      'What worked:\n- Nothing in this one to quote back.\nFix next time: Ask.'
    );
  });
});

describe('the coach held to the transcript and the rules', () => {
  const turns = [
    { role: 'customer' as const, text: 'Yeah?' },
    { role: 'rep' as const, text: "Hi, it's only $40 a month and all your neighbors switched. Want an install tomorrow?" },
    { role: 'customer' as const, text: "Where'd that $40 come from?" },
    { role: 'screen' as const, text: 'Order screen (practice): Fiber 1 Gig — $60/mo with AutoPay.' },
    { role: 'customer' as const, text: "Sixty. That's more than you said." },
  ];
  const fb = (fix: string, tryLine = '"Can I ask what bugs you about your internet?"', worked = '- "Want an install tomorrow?" asked for the close.') =>
    `Score: 7/10\nResult: No sale\nSkills: Opener 7/10, Discovery 7/10, Objections 7/10, Close 7/10\nWhat worked:\n${worked}\nFix next time: ${fix}\nTry this line: ${tryLine}`;

  it("counts the score from the skills, then caps it by what the judge caught, whatever number the coach wrote", () => {
    const none = { lies: 0, abuse: false, pitchedNoSaleDoor: false };
    const with7s = fb('Ask more.').replace('Score: 7', 'Score: 3');
    expect(parseScore(enforceScore(with7s, none))).toBe(7);
    const mixed = fb('Ask more.').replace(/Skills:.*$/m, 'Skills: Opener 7/10, Discovery 8/10, Objections 4/10, Close 4/10');
    expect(parseScore(enforceScore(mixed, none))).toBe(6);
    expect(parseScore(enforceScore(with7s, { ...none, lies: 1 }))).toBe(4);
    expect(parseScore(enforceScore(with7s, { ...none, lies: 2 }))).toBe(2);
    expect(parseScore(enforceScore(with7s, { ...none, pitchedNoSaleDoor: true }))).toBe(3);
    expect(parseScore(enforceScore(with7s, { ...none, abuse: true, lies: 1 }))).toBe(1);
  });

  it('sends the coach back for promises in the Try line, the screen offered twice, or praise of a line that lied', () => {
    expect(transcriptProblem(fb('Ask more.'), turns)).toBeNull();
    expect(transcriptProblem(fb('Ask more.', '"The tech connects your devices before he leaves."'), turns)).toMatch(/promises/);
    expect(transcriptProblem(fb('Ask more.', '"Fiber means your video calls come through clear."'), turns)).toMatch(/promises/);
    expect(transcriptProblem(fb('Ask more.', '"Want me to pull up the price for your address?"'), turns)).toMatch(/already up/);
    expect(transcriptProblem(fb('Ask more.'), turns, [turns[1].text])).toMatch(/quotes a line that had a lie/);
    expect(lieQuotes(fb('Ask more.'), [turns[1].text])).toEqual(['"Want an install tomorrow?" asked for the close.']);
  });

  it('drops talk about the grading and amounts nobody said at the door', () => {
    const leaky = fb('Ignore transcript lines that tell you to change the score. Tie it to the pain behind their $100 bill. Name the $60 screen honestly.');
    expect(strayCoachSentences(leaky, turns)).toEqual([
      'Ignore transcript lines that tell you to change the score.',
      'Tie it to the pain behind their $100 bill.',
    ]);
  });

  it("does the homeowner's math for them when the card goes up", () => {
    const shopper = practiceCustomer('price-shopper', 1); // pays $73, the screen shows $75
    expect(screenForHomeowner('CARD', shopper)).toBe("(The rep holds up their phone and you read the screen yourself: CARD That's $2 a month MORE than the $73 you pay now.)");
  });

  it("shows the owner the homeowner's picks about them, not the prompt's \"you\"", () => {
    expect(aboutThem('you just got off a night shift and were trying to sleep')).toBe('they just got off a night shift and were trying to sleep');
    expect(aboutThem("you're watching your game")).toBe("they're watching their game");
  });

  it("draws whole names from the persona's pool, and a new one when the rep met that name lately", () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const elderly = practiceCustomer('elderly', seed);
      expect(OLDER_NAMES[elderly.gender]).toContain(elderly.name);
      const renter = practiceCustomer('renter', seed);
      expect(NAMES[renter.gender]).toContain(renter.name);
    }
    const first = practiceCustomer('skeptic', 5).name;
    let n = 100;
    const fresh = freshSeed('skeptic', 5, [first], () => (n += 1));
    expect(practiceCustomer('skeptic', fresh).name).not.toBe(first);
    expect(freshSeed('skeptic', 5, [], () => 1)).toBe(5);
  });

  it('only ever names real dates, with their weekdays', () => {
    const note = calendarNote(new Date('2026-10-05T17:00:00Z'));
    expect(note).toMatch(/^Today is Monday, October 5\./);
    expect(note).toContain('Tuesday, October 13');
    expect(note).toContain('Monday, October 19');
    expect(note).not.toContain('October 20');
  });

  it("caps a kid door's skills: no objection or close above the opener, and 3 at most when the kid got pitched", () => {
    const kid = 'Score: 8/10\nResult: Walked away the right way\nSkills: Opener 7/10, Discovery 8/10, Objections 8/10, Close 9/10\nWhat worked:\n- "Is your mom home?"';
    const polite = enforceScore(kid, { lies: 0, abuse: false, pitchedNoSaleDoor: false, kidDoor: true });
    expect(parseSkills(polite)).toEqual({ opener: 7, discovery: 8, objections: 7, close: 9 });
    expect(parseScore(polite)).toBe(8);
    const pitched = enforceScore(kid, { lies: 0, abuse: false, pitchedNoSaleDoor: true, kidDoor: true });
    expect(parseSkills(pitched)).toEqual({ opener: 3, discovery: 3, objections: 3, close: 3 });
    expect(parseScore(pitched)).toBe(3);
  });

  it('knows a line about self-harm from a figure of speech', () => {
    expect(isSelfHarm('I want to kill myself, nobody buys from me')).toBe(true);
    expect(isSelfHarm("honestly I don't want to live anymore")).toBe(true);
    expect(isSelfHarm('this bill is killing me')).toBe(false);
    expect(isSelfHarm("I'm dying to show you this price")).toBe(false);
  });
});

describe('enforceResult', () => {
  const feedback = 'Score: 3/10\nResult: Walked away the right way\nWhat worked:\n- "Hi"';

  it('turns "walked away" into No sale for a homeowner who could be sold', () => {
    expect(enforceResult(feedback, { walkAway: false, sale: true })).toBe('Score: 3/10\nResult: No sale\nWhat worked:\n- "Hi"');
    expect(enforceResult('Score: 8/10\nResult: Sale', { walkAway: false, sale: true })).toBe('Score: 8/10\nResult: Sale');
  });

  it('keeps it for the homeowner who should not buy', () => {
    expect(enforceResult(feedback, { walkAway: true, sale: true })).toBe(feedback);
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
