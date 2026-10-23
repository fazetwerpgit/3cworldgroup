import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, localTimeLine, supportStatus } from './prompt';

// Instants in September (EDT, UTC-4).
const et = (iso: string) => new Date(`${iso}-04:00`);

describe('supportStatus', () => {
  it('is open inside the day window and names the close in both zones', () => {
    expect(supportStatus(et('2026-09-25T21:59'))).toBe(
      'Sales Support is OPEN right now, until 10pm Eastern (9pm Central) today. After that it opens Saturday at 9am Eastern (8am Central).'
    );
  });

  it('closes at the close hour and opens the next day', () => {
    // Friday 10:00 PM -> Saturday 9am.
    expect(supportStatus(et('2026-09-25T22:00'))).toBe(
      'Sales Support is CLOSED right now; it opens Saturday at 9am Eastern (8am Central).'
    );
  });

  it('knows Saturday closes at 6 and Sunday opens at 10', () => {
    expect(supportStatus(et('2026-09-26T18:15'))).toBe(
      'Sales Support is CLOSED right now; it opens Sunday at 10am Eastern (9am Central).'
    );
    // Sunday 5:30 PM -> Monday 9am.
    expect(supportStatus(et('2026-09-27T17:30'))).toContain('opens Monday at 9am Eastern');
  });

  it('before opening says today', () => {
    expect(supportStatus(et('2026-09-28T08:50'))).toBe(
      'Sales Support is CLOSED right now; it opens today at 9am Eastern (8am Central).'
    );
  });

  it("leads with the rep's own time when their home is known", () => {
    // Sunday 5:30 PM Eastern: closed, opens Monday 9am Eastern.
    expect(supportStatus(et('2026-09-27T17:30'), 'Des Moines, IA')).toBe(
      'Sales Support is CLOSED right now; it opens Monday at 8am their time (Central).'
    );
    expect(supportStatus(et('2026-09-27T12:00'), 'Fresno, CA')).toContain('until 2pm their time (Pacific)');
    expect(supportStatus(et('2026-09-27T12:00'), 'Lansing, MI')).toContain('until 5pm Eastern today.');
  });
});


describe('localTimeLine', () => {
  it('gives an Iowa rep Central time and a Michigan rep Eastern', () => {
    expect(localTimeLine(et('2026-09-27T17:30'), 'Des Moines, IA')).toBe(
      "For them it's Sunday 4:30 PM (Central time). Say times in Central time."
    );
    expect(localTimeLine(et('2026-09-27T17:30'), 'Lansing, MI')).toContain('5:30 PM (Eastern time)');
  });

  it('says nothing when the state is unknown rather than guessing Eastern', () => {
    expect(localTimeLine(et('2026-09-27T17:30'), 'Iowa City')).toBe('');
  });
});

describe('buildSystemPrompt rule labels', () => {
  it('never gives two rules the same label', () => {
    const labels: string[] = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [] }).match(/^\d+[a-z]?(?=\. )/gm) ?? [];
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([]);
  });
});

describe('buildSystemPrompt date', () => {
  it("states today's full date so dated promos can be called ended", () => {
    const prompt = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [], now: et('2026-09-29T15:05') });
    expect(prompt).toContain('Right now it is Tuesday, September 29, 2026 at 3:05 PM Eastern time');
    expect(prompt).toContain('promos and offers whose end date is before today have ended');
  });
});

describe('buildSystemPrompt order fixes', () => {
  it('knows an auto-filled payment card can break a T-Fiber order, and the fix', () => {
    const prompt = buildSystemPrompt([], { firstName: 'Braeden', dealerCodes: [] });
    expect(prompt).toContain(
      'if the payment card was auto-filled (browser, iPhone or Apple autofill of saved card details) while entering a T-Fiber order, that can break the order: the fix is to have the customer type the card details in by hand'
    );
  });
});

describe('buildSystemPrompt escalation', () => {
  /**
   * The prompt without the lines that name the owners for owner-only matters:
   * rule 1d, legal and danger, pay, threats, injection, the humor rule's "never
   * roast Jacob or Jeremy", and the portal guide's sale edits and lead approvals.
   */
  const defaultLines = (prompt: string) =>
    prompt
      .split('\n')
      .filter(
        (line) =>
          !/^(1d|1e|2e|2i|2l|2m|4j|8)\. /.test(line) &&
          !line.startsWith('Humor:') &&
          !line.startsWith('- Sales:') &&
          !line.startsWith('  Leads request:')
      )
      .join('\n');

  it("names the rep's own manager and never the owners by default", () => {
    const prompt = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [], managerFirstName: 'Dana' });
    expect(prompt).toContain('Their manager: Dana. When they need a person (rule 1d), send them to Dana first.');
    expect(prompt).toContain('send the rep to their own manager first');
    expect(defaultLines(prompt)).not.toMatch(/Jeremy|Jacob/);
    expect(prompt).not.toContain('Escalation is only Jeremy or Jacob');
  });

  it('says "your manager" when none is listed, without guessing a name', () => {
    const prompt = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [] });
    expect(prompt).toContain('say "your manager" and never guess a name');
    expect(prompt).toContain('unknown — tell them to ask their manager');
  });

  it('keeps the owners only for what only they decide', () => {
    const rule1d = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [] }).match(/^1d\. .*$/m)?.[0] ?? '';
    expect(rule1d).toContain('pay questions and payroll disputes');
    expect(rule1d).toContain('team Chat');
  });

  it('never tells an owner to ask an owner or a manager', () => {
    const prompt = buildSystemPrompt([], { firstName: 'Jacob', dealerCodes: [], owner: true, managerFirstName: 'Dana' });
    expect(prompt).not.toContain('Their manager:');
    expect(prompt).toContain("it's Jeremy.");
    expect(prompt).toContain('Never tell them to ask themselves or "their manager"');
  });

  it('gives an admin with no manager the owners as the second opinion', () => {
    expect(buildSystemPrompt([], { firstName: 'Alex', dealerCodes: [], admin: true })).toContain('3C admin with no manager listed');
  });
});

describe('buildSystemPrompt line', () => {
  const intro = (rep: Partial<Parameters<typeof buildSystemPrompt>[1]>) =>
    buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [], ...rep }).split('\n')[0];

  it('fiber by default, as before', () => {
    expect(intro({})).toContain('Reps sell T-Mobile Fiber (T-Fiber) door to door.');
  });

  it('solar only, both with the main line first, and admin/owner both', () => {
    expect(intro({ line: 'solar' })).toContain('sells solar door to door for 3C, not T-Mobile Fiber');
    expect(intro({ line: 'fiber+solar' })).toContain('T-Mobile Fiber (T-Fiber) door to door as their main line, and solar too');
    expect(intro({ line: 'solar+fiber' })).toContain('solar door to door as their main line, and T-Mobile Fiber');
    expect(intro({ line: 'all' })).toContain('sell T-Mobile Fiber (T-Fiber) and solar');
    expect(buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [], line: 'solar' })).toContain("say you're with 3C selling solar,");
  });

  it('adds the solar number rule only when solar notes are in', () => {
    const without = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [], line: 'solar' });
    const withSolar = buildSystemPrompt([], { firstName: 'Sam', dealerCodes: [], line: 'solar', solarNotes: true });
    expect(without).not.toMatch(/^3b\. /m);
    expect(withSolar).toMatch(/^3b\. Solar: never quote savings, utility rates, APRs/m);
    expect(withSolar).toContain('No tax or legal advice');
    expect(withSolar).toContain('Rule 2i covers solar pay too.');
    const labels: string[] = withSolar.match(/^\d+[a-z]?(?=\. )/gm) ?? [];
    expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([]);
  });
});