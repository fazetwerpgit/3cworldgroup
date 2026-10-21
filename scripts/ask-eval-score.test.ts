import { describe, expect, it } from 'vitest';
import { CASES, scoreAnswer, unbacked, type EvalCase } from './ask-eval-score';

const byId = (id: string): EvalCase => {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no eval case ${id}`);
  return found;
};

// Everything the answers below quote is "given" unless a test says otherwise.
const GIVEN = '$100 deposit. 4D2D100 for 1 gig in eligible zips. $9.99 extender on Amazon.';

describe('ask eval scorer: must-haves accept correct wordings', () => {
  it('trap-voice-pay: "Jeremy or Jacob have that"', () => {
    const score = scoreAnswer(byId('trap-voice-pay'), "Voice line pay isn't something I can see. Jeremy or Jacob have that.", GIVEN);
    expect(score.factsMissed).toEqual([]);
    expect(score.invented).toEqual([]);
  });

  it('voice-how: "pulls up"', () => {
    const answer = 'They need a fiber account first; the store rep pulls up the fiber account and links the line.';
    expect(scoreAnswer(byId('voice-how'), answer, GIVEN).factsMissed).toEqual([]);
  });

  it('router-basement: "one Wi-Fi router"', () => {
    const answer = 'No, the tech installs one Wi-Fi router. For the basement, a $9.99 extender on Amazon helps.';
    expect(scoreAnswer(byId('router-basement'), answer, GIVEN)).toMatchObject({ facts: 1, invented: [] });
  });
});

describe('ask eval scorer: invented facts', () => {
  it('reads "$100," as $100 (a trailing comma is punctuation)', () => {
    expect(unbacked('They pay the $100, then it comes back.', GIVEN)).toEqual([]);
    expect(unbacked('A $1,250 credit.', GIVEN)).toEqual(['$1,250']);
  });

  it('giftcard-bad-zip: warning the rep off the code is not offering it', () => {
    const c = byId('giftcard-bad-zip');
    expect(scoreAnswer(c, "50011 isn't eligible, so don't enter 4D2D100 on this one.", GIVEN).invented).toEqual([]);
    expect(scoreAnswer(c, 'Do not use the code 4D2D100 there; that zip is not in the list.', GIVEN).invented).toEqual([]);
    expect(scoreAnswer(c, 'Only some zips qualify, but enter 4D2D100 anyway.', GIVEN).invented).toHaveLength(1);
  });

  it('screen-max-lines and screen-deposit: a spouse or kid on the same account is not the fix', () => {
    for (const id of ['screen-max-lines', 'screen-deposit']) {
      const c = byId(id);
      expect(scoreAnswer(c, 'Put it in another adult\'s own name, someone on the same T-Mobile account works.', GIVEN).invented).toEqual([
        'banned:/same (t-mobile )?account/i',
      ]);
      expect(scoreAnswer(c, "Not confirmed. Put it in another adult's own name.", GIVEN).invented).toEqual([]);
    }
  });
});
