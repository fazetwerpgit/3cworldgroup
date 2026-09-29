import { describe, expect, it } from 'vitest';
import { PERSONA_IDS, VOICE_BOOK, enforceResult, practiceCustomer } from './practice';
import {
  STANDARD_DOOR,
  ambientFor,
  beatNow,
  doorClock,
  drawDoor,
  drawDoorKind,
  drawSurprise,
  fixSpouseLines,
  parseDoor,
  resultRules,
  splitSpeakers,
  spouseHere,
  spouseLinesProblem,
  surpriseNote,
  type PracticeDoor,
} from './practiceDoor';

// The kind of door and the surprise on the porch: drawn from the session seed,
// so every turn and the coach see the same door.

const seeds = Array.from({ length: 4000 }, (_, i) => (i * 2654435761) >>> 0);
const rep = (text: string) => ({ role: 'rep' as const, text });
const ho = (text: string) => ({ role: 'customer' as const, text });

describe('drawDoorKind', () => {
  it('is the same for the same seed, and about 1 in 10 is not a normal door', () => {
    for (const seed of seeds.slice(0, 50)) expect(drawDoorKind(seed, null)).toBe(drawDoorKind(seed, null));
    const kinds = seeds.map((seed) => drawDoorKind(seed, null));
    const share = (kind: string) => kinds.filter((k) => k === kind).length / kinds.length;
    expect(share('kid')).toBeGreaterThan(0.025);
    expect(share('kid')).toBeLessThan(0.055);
    expect(share('ring')).toBeGreaterThan(0.015);
    expect(share('landlord')).toBeGreaterThan(0.015);
    expect(1 - share('standard')).toBeGreaterThan(0.08);
    expect(1 - share('standard')).toBeLessThan(0.12);
  });

  it('never makes a landlord door (a renter) right after a renter', () => {
    expect(seeds.some((seed) => drawDoorKind(seed, 'renter') === 'landlord')).toBe(false);
  });
});

describe('drawSurprise', () => {
  it('is fixed per seed, hits about 3 in 10 normal doors, and none of the other doors', () => {
    const customer = practiceCustomer('busy-parent', 7);
    for (const seed of seeds.slice(0, 50)) expect(drawSurprise(seed, customer, 'standard')).toEqual(drawSurprise(seed, customer, 'standard'));
    const hits = seeds.filter((seed) => drawSurprise(seed, customer, 'standard')).length / seeds.length;
    expect(hits).toBeGreaterThan(0.26);
    expect(hits).toBeLessThan(0.34);
    for (const kind of ['kid', 'ring', 'landlord'] as const) {
      expect(seeds.slice(0, 200).every((seed) => drawSurprise(seed, customer, kind) === null)).toBe(true);
    }
  });

  it("gives the spouse a voice of their own: never a kid's, never the homeowner's", () => {
    for (const seed of seeds.slice(0, 600)) {
      const customer = practiceCustomer('busy-parent', seed);
      const surprise = drawSurprise(seed, customer, 'standard');
      if (surprise?.kind !== 'spouse') continue;
      expect(['Achernar', 'Erinome', 'Leda', 'Zephyr', customer.ttsVoice]).not.toContain(surprise.voice);
    }
  });

  it('brings a spouse only where one fits, in the other gender, at rep line 2 or 3', () => {
    for (const id of PERSONA_IDS) {
      for (const seed of seeds.slice(0, 400)) {
        const customer = practiceCustomer(id, seed);
        const surprise = drawSurprise(seed, customer, 'standard');
        if (surprise?.kind === 'spouse') {
          expect(['renter', 'spouse-decides']).not.toContain(id);
          expect(VOICE_BOOK[surprise.voice].gender).not.toBe(customer.gender);
          expect([2, 3]).toContain(surprise.atLine);
        }
        if (surprise?.kind === 'beat') expect([1, 2, 3]).toContain(surprise.atLine);
      }
    }
    const busy = seeds.map((seed) => drawSurprise(seed, practiceCustomer('busy-parent', seed), 'standard'));
    expect(busy.some((surprise) => surprise?.kind === 'spouse')).toBe(true);
    expect(busy.some((surprise) => surprise?.kind === 'beat')).toBe(true);
  });

  it('comes back the same from practiceSessions, and junk reads as a plain door', () => {
    const customer = practiceCustomer('happy-spectrum', 3);
    const seed = seeds.find((s) => drawSurprise(s, customer, 'standard')?.kind === 'spouse')!;
    const door = drawDoor(seed, customer, 'standard', new Date('2026-09-27T23:10:00Z'));
    expect(parseDoor(JSON.parse(JSON.stringify(door)))).toEqual(door);
    expect(parseDoor({ kind: 'castle', surprise: { kind: 'dragon' } })).toEqual({ ...STANDARD_DOOR });
    expect(parseDoor(undefined).kind).toBe('standard');
  });
});

describe('the surprise on the porch', () => {
  const customer = practiceCustomer('busy-parent', 11);
  const spouse: PracticeDoor = {
    ...STANDARD_DOOR,
    surprise: { kind: 'spouse', atLine: 2, voice: 'Charon', name: 'Mike', objection: "We don't sign anything at the door." },
  };
  const phone: PracticeDoor = { ...STANDARD_DOOR, surprise: { kind: 'beat', beat: 'phone', atLine: 1 } };

  it('tells the homeowner when the spouse walks up, on the rep line it is due, and not before', () => {
    const one = [ho('Hi?'), rep('Hi there.')];
    const two = [...one, ho('Yeah?'), rep('Who do you have for internet?')];
    expect(surpriseNote(spouse, one, customer)).toBeNull();
    expect(spouseHere(spouse, one)).toBe(false);
    expect(surpriseNote(spouse, two, customer)).toMatch(/walks up behind you.*SPOUSE:.*We don't sign anything at the door/);
    expect(spouseHere(spouse, [...two, ho('Xfinity.'), rep('Got it.')])).toBe(true);
    expect(surpriseNote(spouse, [...two, ho('Xfinity.'), rep('Got it.')], customer)).toBeNull();
  });

  it('interrupts on its line only', () => {
    const one = [ho('Hi?'), rep('Hi there.')];
    expect(beatNow(phone, one)).toBe('phone');
    expect(surpriseNote(phone, one, customer)).toMatch(/phone starts ringing/);
    expect(beatNow(phone, [...one, ho('Hang on.'), rep('Sure.')])).toBeNull();
  });

  it('splits a reply by who says it, once the spouse is there', () => {
    expect(splitSpeakers("Uh, this is my husband.\nSPOUSE: We don't sign anything at the door.\nHomeowner: Yeah.", spouse, true)).toEqual([
      { speaker: 'homeowner', text: 'Uh, this is my husband.' },
      { speaker: 'spouse', text: "We don't sign anything at the door." },
      { speaker: 'homeowner', text: 'Yeah.' },
    ]);
    // Before the spouse is there, a "Spouse:" label is just words.
    expect(splitSpeakers('Mike: hold on.', spouse, false)).toEqual([{ speaker: 'homeowner', text: 'Mike: hold on.' }]);
    expect(splitSpeakers("My mom's not home.", { ...STANDARD_DOOR, kind: 'kid', kidVoice: 'Leda' }, false)).toEqual([
      { speaker: 'kid', text: "My mom's not home." },
    ]);
  });
});

describe("the spouse's own lines", () => {
  const customer = practiceCustomer('busy-parent', 4);
  const spouse: PracticeDoor = {
    ...STANDARD_DOOR,
    surprise: { kind: 'spouse', atLine: 2, voice: 'Charon', name: 'Mike', objection: 'The last time we switched, the install guy never showed up and we lost a day.' },
  };
  const homeownersLine = customer.persona.objections[0];

  it('splits a speaker label that starts mid-line', () => {
    expect(splitSpeakers("This is my wife. We've got Mediacom. SPOUSE: We read every word first.", spouse, true)).toEqual([
      { speaker: 'homeowner', text: "This is my wife. We've got Mediacom." },
      { speaker: 'spouse', text: 'We read every word first.' },
    ]);
  });

  it("catches a spouse line carrying the homeowner's words, or a spouse walking up with no lead-in", () => {
    const mixed = [{ speaker: 'spouse' as const, text: `The last time we switched, the install guy never showed up. ${homeownersLine}` }];
    expect(spouseLinesProblem(mixed, spouse, customer, true)).toBe(true);
    expect(spouseLinesProblem([{ speaker: 'spouse', text: 'The install guy never showed up last time.' }], spouse, customer, true)).toBe(true);
    const good = [
      { speaker: 'homeowner' as const, text: 'Oh, hang on, this is my wife.' },
      { speaker: 'spouse' as const, text: 'Last time we switched the install guy never showed up.' },
    ];
    expect(spouseLinesProblem(good, spouse, customer, true)).toBe(false);
  });

  it("puts it right: the homeowner's words back with the homeowner, a lead-in first", () => {
    const mixed = [{ speaker: 'spouse' as const, text: `The last time we switched, the install guy never showed up. ${homeownersLine}` }];
    const fixed = fixSpouseLines(mixed, spouse, customer, true);
    // A lead-in first, the spouse's own worry, then the homeowner's words after it, as said.
    expect(fixed.map((line) => line.speaker)).toEqual(['homeowner', 'spouse', 'homeowner']);
    expect(fixed[1]).toEqual({ speaker: 'spouse', text: 'The last time we switched, the install guy never showed up.' });
    expect(fixed[2].text).toBe(homeownersLine);
    // Nothing after the spouse: the homeowner reacts.
    const bare = fixSpouseLines([{ speaker: 'spouse', text: 'The install guy never showed up last time.' }], spouse, customer, true);
    expect(bare.map((line) => line.speaker)).toEqual(['homeowner', 'spouse', 'homeowner']);
    expect(spouseLinesProblem(fixed, spouse, customer, true)).toBe(false);
  });
});

describe('the door and the result', () => {
  it('never records a Sale where there is none to be had, and lets a good exit count', () => {
    const renter = practiceCustomer('renter', 2);
    const rules = resultRules(renter, { ...STANDARD_DOOR, kind: 'landlord' });
    expect(rules).toEqual({ walkAway: true, sale: false });
    expect(enforceResult('Score: 9/10\nResult: Sale', rules)).toBe('Score: 9/10\nResult: No sale');
    expect(enforceResult('Score: 9/10\nResult: Walked away the right way', rules)).toBe('Score: 9/10\nResult: Walked away the right way');
    expect(resultRules(practiceCustomer('busy-parent', 2), { ...STANDARD_DOOR, kind: 'kid', kidVoice: 'Leda' })).toEqual({ walkAway: true, sale: false });
    expect(resultRules(practiceCustomer('busy-parent', 2), STANDARD_DOOR)).toEqual({ walkAway: false, sale: true });
  });

  it('plays what is going on inside, and nothing through a Ring camera', () => {
    const find = (id: 'busy-parent' | 'elderly', word: string) =>
      practiceCustomer(id, seeds.find((seed) => practiceCustomer(id, seed).details.every((d) => d.includes(word)))!);
    expect(ambientFor(find('busy-parent', 'kids'), STANDARD_DOOR)).toBe('kids');
    expect(ambientFor(find('elderly', 'dog'), STANDARD_DOOR)).toBe('dog');
    expect(ambientFor(find('elderly', 'dog'), { ...STANDARD_DOOR, kind: 'ring' })).toBeNull();
  });

  it('knows dinnertime and the Sunday game from the real clock (Chicago)', () => {
    expect(doorClock(new Date('2026-09-29T23:15:00Z'), 1)).toMatch(/^Tuesday, 6:15 pm\. /);
    // Early evening: dinner about 1 door in 3, something else the rest of the time.
    const evenings = seeds.slice(0, 900).map((seed) => doorClock(new Date('2026-09-29T23:15:00Z'), seed));
    const dinner = evenings.filter((clock) => clock.includes('dinnertime')).length / evenings.length;
    expect(dinner).toBeGreaterThan(0.25);
    expect(dinner).toBeLessThan(0.42);
    expect(new Set(evenings).size).toBeGreaterThanOrEqual(5);
    expect(doorClock(new Date('2026-09-27T19:05:00Z'))).toMatch(/^Sunday, 2:05 pm\. The football game is on/);
    expect(doorClock(new Date('2026-06-14T19:05:00Z'))).toBe('Sunday, 2:05 pm.');
    expect(doorClock(new Date('2026-09-30T02:30:00Z'))).toMatch(/getting late/);
  });
});
