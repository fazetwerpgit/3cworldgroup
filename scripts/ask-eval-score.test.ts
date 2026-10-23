import { describe, expect, it } from 'vitest';
import { askLineFor, hasSolarNotes, notesForAudience } from '@/lib/ask/audience';
import { buildSystemPrompt } from '@/lib/ask/prompt';
import { CASES, EVAL_FIBER_REP, EVAL_MANAGER, SYNTHETIC_NOTES, scoreAnswer, unbacked, type EvalCase } from './ask-eval-score';

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

describe('ask eval audience cases (what the harness builds, no model call)', () => {
  /** The system prompt the harness builds for a case, from the synthetic notes only. */
  const promptFor = (c: EvalCase) => {
    const user = c.user ?? EVAL_FIBER_REP;
    const seen = notesForAudience(SYNTHETIC_NOTES, user);
    return buildSystemPrompt(seen, {
      firstName: 'Sam', dealerCodes: [], line: askLineFor(user, user.mainLine), solarNotes: hasSolarNotes(seen), managerFirstName: EVAL_MANAGER,
    });
  };

  it('a fiber rep never gets the solar note; a solar rep and a dual rep do, with the solar rule', () => {
    const fiber = promptFor(byId('audience-fiber-no-solar'));
    expect(fiber).not.toContain('SUNSIT77');
    expect(fiber).not.toMatch(/^3b\. /m);
    const solar = promptFor(byId('audience-solar-gets-solar'));
    expect(solar).toContain('SUNSIT77');
    expect(solar).toMatch(/^3b\. Solar/m);
    expect(solar.split('\n')[0]).toContain('sells solar door to door');
    const dual = promptFor(byId('audience-dual-solar-main'));
    expect(dual).toContain('48 hours out');
    expect(dual.split('\n')[0]).toContain('solar door to door as their main line');
  });

  it('scores a leaked solar code as invented for the fiber rep, and "ask Dana" as the right not-sure', () => {
    const c = byId('audience-fiber-no-solar');
    const given = promptFor(c);
    expect(scoreAnswer(c, 'Not sure on that one, ask Dana.', given)).toEqual({ facts: 1, factsMissed: [], invented: [] });
    expect(scoreAnswer(c, 'It is SUNSIT77.', given).invented).toEqual(['unbacked:SUNSIT77', 'banned:/SUNSIT77/']);
  });

  it('escalation cases fail an answer that sends the rep to the owners', () => {
    expect(scoreAnswer(byId('escalate-who'), 'Not sure who Ben is. Ask Jeremy or Jacob.', GIVEN).invented).toEqual(['banned:/jeremy|jacob/i']);
    expect(scoreAnswer(byId('escalate-who'), 'Not sure on that one. Ask Dana, or try team Chat.', GIVEN)).toEqual({ facts: 1, factsMissed: [], invented: [] });
  });
});
