import { describe, expect, it } from 'vitest';
import { buildFeedbackPrompt, feedbackProblem, practiceCustomer } from './practice';
import {
  assignedPersona,
  assignmentDone,
  MAX_CORRECTION_CHARS,
  correctionsBlock,
  deliveryLine,
  feedbackPart,
  fillerCount,
  openAssignmentsFor,
  parseAssignment,
  parseDelivery,
  parseSkills,
  redoPoint,
  type CountedSession,
  type PracticeAssignment,
} from './practiceCoaching';

const CARD = `Score: 6/10
Result: No sale
Skills: Opener 7/10, Discovery 4/10, Objections 5/10, Close 3/10
What worked:
- "Who do you have for internet?"
Fix next time: Ask what the bill is.
Try this line: "What's bugging you about it?"`;

describe('skill scores', () => {
  it('reads the four scores from the Skills line, and nothing from a broken one', () => {
    expect(parseSkills(CARD)).toEqual({ opener: 7, discovery: 4, objections: 5, close: 3 });
    expect(parseSkills(CARD.replace('Close 3/10', 'Close 11/10'))).toBeNull();
    expect(parseSkills(CARD.replace(', Close 3/10', ''))).toBeNull();
    expect(parseSkills('Score: 6/10')).toBeNull();
  });

  it('sends the coach back when the Skills line is missing or off', () => {
    expect(feedbackProblem(CARD)).toBeNull();
    expect(feedbackProblem(CARD.replace(/^Skills:.*\n/m, ''))).toBe('the sections are missing or out of order');
    expect(feedbackProblem(CARD.replace('Opener 7/10', 'Opener: good'))).toMatch(/^the Skills line is not/);
  });
});

describe('delivery', () => {
  it('counts um and uh, and "you know" and "like" only standing alone', () => {
    expect(fillerCount('Um, so, uh, you know, it is, like, way faster. Umm.')).toEqual({ um: 2, uh: 1, 'you know': 1, like: 1 });
    expect(fillerCount("I'd like to show you. Looks like you have Spectrum. Would you like that?")).toEqual({});
    // Real phrases, not fillers.
    expect(fillerCount("you know it's not a promo that jumps")).toEqual({});
    expect(fillerCount("it doesn't slow down at night like cable")).toEqual({});
    expect(fillerCount("It's fast, you know? Like, really fast.")).toEqual({ 'you know': 1, like: 1 });
  });

  it('takes only a sane delivery from the page, and shows it as plain facts', () => {
    expect(parseDelivery({ talkMs: 30_000, listenMs: 45_000, words: 75, fillers: { um: 3, like: 1, shouting: 9 }, lines: 4 })).toEqual({
      talkMs: 30_000,
      listenMs: 45_000,
      words: 75,
      fillers: { um: 3, like: 1 },
      lines: 4,
    });
    expect(parseDelivery({ talkMs: 0, listenMs: 1000, words: 0, fillers: {}, lines: 0 })).toBeNull();
    expect(parseDelivery({ talkMs: -5, listenMs: 1000, words: 3, fillers: {}, lines: 1 })).toBeNull();
    expect(parseDelivery(null)).toBeNull();
    expect(deliveryLine({ talkMs: 30_000, listenMs: 45_000, words: 75, fillers: { um: 3, like: 1 }, lines: 4 })).toBe(
      'You talked 40% of the time · 150 words a minute · 8 fillers a minute (um 3, like 1)'
    );
    // A line in a voice that couldn't be timed: no share, or it reads "you talked 97%".
    expect(deliveryLine({ talkMs: 30_000, listenMs: 2_000, words: 75, fillers: {}, lines: 4, untimed: true })).toBe('150 words a minute · no fillers heard');
    // The phone's own voice isn't timed: no share without the homeowner's.
    expect(deliveryLine({ talkMs: 60_000, listenMs: 0, words: 140, fillers: {}, lines: 5 })).toBe('140 words a minute · no fillers heard');
  });
});

describe('redoPoint', () => {
  it('goes back to the worst line: abuse, else a lie, else the first weak one, with the patience before it', () => {
    const steps = [
      { at: 2, event: 'ok' as const, patience: 5 },
      { at: 4, event: 'weak' as const, patience: 5 },
      { at: 6, event: 'lie' as const, patience: 4 },
      { at: 8, event: 'weak' as const, patience: 2 },
    ];
    expect(redoPoint(steps)).toEqual({ keep: 5, patience: 4 });
    expect(redoPoint(steps.filter((step) => step.event !== 'lie'))).toEqual({ keep: 3, patience: 5 });
    expect(redoPoint([{ at: 2, event: 'ok', patience: 5 }])).toBeNull();
  });
});

describe('assignments', () => {
  const assignment: PracticeAssignment = {
    id: 'a1',
    repUid: null,
    repName: 'Everyone',
    persona: 'skeptic',
    count: 2,
    due: '2026-10-02',
    createdAt: '2026-09-28T15:00:00.000Z',
  };
  const session = (over: Partial<CountedSession>): CountedSession => ({
    uid: 'r1',
    persona: 'skeptic',
    createdAt: '2026-09-29T15:00:00.000Z',
    redo: false,
    real: true,
    ...over,
  });

  it('counts the rep\'s own new doors of that type from when it was set through its day (Chicago)', () => {
    const sessions = [
      session({}),
      session({ createdAt: '2026-10-03T04:30:00.000Z' }), // 11:30 pm Oct 2 in Chicago: still on time
      session({ createdAt: '2026-10-03T06:00:00.000Z' }), // 1 am Oct 3: late
      session({ createdAt: '2026-09-28T14:00:00.000Z' }), // before it was set
      session({ persona: 'renter' }),
      session({ redo: true }),
      session({ uid: 'r2' }),
      // One line and End, or an abusive door: not practice.
      session({ real: false }),
    ];
    expect(assignmentDone(assignment, sessions, 'r1')).toBe(2);
    expect(assignmentDone({ ...assignment, persona: 'any' }, sessions, 'r1')).toBe(3);
    expect(assignmentDone(assignment, sessions, 'r2')).toBe(1);
  });

  it("shows a rep theirs and everyone's while open, and knocks them the type that isn't done yet", () => {
    const mine = { ...assignment, id: 'a2', repUid: 'r1', persona: 'renter' as const, count: 1, due: '2026-10-01' };
    const theirs = { ...assignment, id: 'a3', repUid: 'r2', persona: 'elderly' as const };
    const over = { ...assignment, id: 'a4', due: '2026-09-29' };
    const open = openAssignmentsFor('r1', [assignment, mine, theirs, over], [session({})], '2026-09-30');
    expect(open.map(({ assignment: a, done }) => [a.id, done])).toEqual([
      ['a2', 0],
      ['a1', 1],
    ]);
    expect(assignedPersona(open)).toBe('renter');
    const renterDone = openAssignmentsFor('r1', [assignment, mine], [session({}), session({ persona: 'renter' })], '2026-09-30');
    expect(assignedPersona(renterDone)).toBe('skeptic');
    expect(assignedPersona(openAssignmentsFor('r1', [{ ...assignment, persona: 'any' }], [], '2026-09-30'))).toBeNull();
  });

  it('takes a sane assignment from the owner', () => {
    expect(parseAssignment({ repUid: 'all', persona: 'any', count: 3, due: '2026-10-02' }, '2026-09-30')).toEqual({
      ok: true,
      value: { repUid: null, persona: 'any', count: 3, due: '2026-10-02' },
    });
    expect(parseAssignment({ repUid: 'r1', persona: 'skeptic', count: 3, due: '2026-09-29' }, '2026-09-30')).toMatchObject({ ok: false });
    expect(parseAssignment({ repUid: 'r1', persona: 'wizard', count: 3, due: '2026-10-02' }, '2026-09-30')).toMatchObject({ ok: false });
    expect(parseAssignment({ repUid: 'r1', persona: 'skeptic', count: 0, due: '2026-10-02' }, '2026-09-30')).toMatchObject({ ok: false });
  });
});

describe("the owner's corrections", () => {
  it('pulls the part the owner is correcting out of the feedback', () => {
    expect(feedbackPart(CARD, 'score')).toBe('6/10');
    expect(feedbackPart(CARD, 'discovery')).toBe('Discovery 4/10');
    expect(feedbackPart(CARD, 'worked-1')).toBe('"Who do you have for internet?"');
    expect(feedbackPart(CARD, 'worked-2')).toBe('');
    expect(feedbackPart(CARD, 'fix')).toBe('Ask what the bill is.');
  });

  it('reach the coach as calibration, newest first, and nothing when there are none', () => {
    const block = correctionsBlock([
      { part: 'score', original: '8/10', take: 'A 5 at most: they never asked a question.', personaLabel: 'Skeptic' },
      { part: 'fix', original: 'Mention the price.', take: 'Never push price first at a busy door.', personaLabel: 'Busy parent at dinner' },
    ]);
    const prompt = buildFeedbackPrompt([], practiceCustomer('skeptic', 1), 'rep', undefined, block);
    expect(prompt).toContain('- Score, Skeptic door: the coach said "8/10"; the owner says: "A 5 at most: they never asked a question."');
    expect(prompt.indexOf('Score, Skeptic')).toBeLessThan(prompt.indexOf('Fix next time, Busy parent'));
    expect(buildFeedbackPrompt([], practiceCustomer('skeptic', 1), 'rep')).not.toContain('Calibration');

    // The whole take, up to what the owner could type: the point is often in its last sentence.
    const long = `${'They asked good questions and stayed calm the whole time, which is worth something. '.repeat(4)}But a 7 is too high: never pitch before you know their bill.`;
    expect(long.length).toBeGreaterThan(240);
    expect(long.length).toBeLessThanOrEqual(MAX_CORRECTION_CHARS);
    expect(correctionsBlock([{ part: 'score', original: '7/10', take: long, personaLabel: 'Skeptic' }])).toContain(
      'But a 7 is too high: never pitch before you know their bill."'
    );
  });
});
