import { describe, expect, it } from 'vitest';
import { BARGE_IN_WORDS, SPECULATION_SLACK, nonEchoWords, talkBudgetMs, wordsApart } from './practiceHandsFree';

describe('talkBudgetMs', () => {
  it('gives a patient homeowner 25 s and an impatient one 10 s, less as they lose patience, never under 8 s', () => {
    expect(talkBudgetMs(5, 5)).toBe(25_000);
    expect(talkBudgetMs(3, 3)).toBe(10_000);
    expect(talkBudgetMs(5, 3)).toBeLessThan(talkBudgetMs(5, 4));
    expect(talkBudgetMs(3, 0)).toBe(8_000);
    expect(talkBudgetMs(5, 0)).toBe(12_500);
  });
});

describe('nonEchoWords', () => {
  const homeowner = "Look, I'm in the middle of dinner. What is this about?";
  it("doesn't count the homeowner's own words coming back through the speaker as the rep", () => {
    expect(nonEchoWords("in the middle of dinner what is this", homeowner)).toEqual([]);
    expect(nonEchoWords('Totally get it, I will be quick', homeowner).length).toBeGreaterThanOrEqual(BARGE_IN_WORDS);
    // A stray word or two isn't talking over them.
    expect(nonEchoWords('uh dinner', homeowner).length).toBeLessThan(BARGE_IN_WORDS);
  });
});

describe('wordsApart', () => {
  it('lets punctuation and a word or two go, and not a line that grew', () => {
    expect(wordsApart("Hi, I'm Sam with 3C", "Hi I'm Sam with 3C.")).toBe(0);
    expect(wordsApart('who do you have for internet', 'who do you have for your internet')).toBeLessThanOrEqual(SPECULATION_SLACK);
    expect(wordsApart('so what do you pay', 'So what do you pay for Spectrum right now each month?')).toBeGreaterThan(SPECULATION_SLACK);
  });
});
