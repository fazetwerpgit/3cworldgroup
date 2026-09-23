import { describe, expect, it } from 'vitest';
import { buildRepDigest } from './digest';
import { busyWeekInput, lightWeekInput } from './fixtures';
import { DISCLAIMER, emailBaseUrl, escapeHtml, money, renderWeeklyInstallsEmail } from './render';

const BASE = 'https://www.3cworldgroup.com';

describe('renderWeeklyInstallsEmail', () => {
  const busy = renderWeeklyInstallsEmail(buildRepDigest(busyWeekInput()), { baseUrl: BASE });
  const light = renderWeeklyInstallsEmail(buildRepDigest(lightWeekInput()), { baseUrl: BASE });

  it('puts the count and the estimate in the subject', () => {
    expect(busy.subject).toBe('Your installs last week: 4 installed · est. $471');
    expect(light.subject).toBe('Your installs last week: 1 installed · est. $97.50');
  });

  it('shows every section with the rep’s rows', () => {
    for (const text of [
      'Installed last week',
      'Maria Lopez',
      '4417 Ridgecrest Dr · TFiber 1 Gig',
      'Installed Tue, Sep 15',
      'est. $138',
      'Est. payout Sep 28–Oct 3',
      'Coming up this week',
      'Priya Natarajan',
      'Cancelled by the carrier',
      'Kevin Tran',
      '77 Birchwood Pl',
      'Needs a date',
      'Alicia Gomez',
      'Missed install',
      'est. $471',
      'from 4 installs',
    ]) {
      expect(busy.html).toContain(escapeHtml(text));
    }
    expect(light.html).not.toContain('Cancelled by the carrier');
    expect(light.html).not.toContain('Coming up this week');
  });

  it('labels every dollar figure as an estimate and never prints a single pay date', () => {
    for (const body of [busy.html, busy.text, light.html, light.text]) {
      const dollars = body.match(/\$\d[\d,.]*/g) ?? [];
      const labelled = body.match(/est\. \$\d[\d,.]*/g) ?? [];
      expect(dollars.length).toBeGreaterThan(0);
      expect(labelled.length).toBe(dollars.length);
      expect(body).not.toMatch(/pays? on/i);
      expect(body).not.toMatch(/paid on/i);
    }
  });

  it('carries the footer, the sales link and the escalation link', () => {
    for (const body of [busy.html, busy.text]) {
      expect(body).toContain(`${BASE}/portal/sales`);
      expect(body).toContain(`${BASE}/portal/payroll-dispute`);
      expect(body).toContain('Missing an install?');
    }
    expect(busy.html).toContain(escapeHtml(DISCLAIMER));
    expect(busy.text).toContain(DISCLAIMER);
  });

  it('never leaks another rep’s rows', () => {
    expect(busy.html).not.toContain('Other Customer');
    expect(busy.html).not.toContain('Not TFiber');
    expect(busy.html).not.toContain('Rejected Sale');
  });

  it('escapes customer-typed text', () => {
    const input = lightWeekInput();
    input.sales[0].customerName = '<script>alert(1)</script>';
    const html = renderWeeklyInstallsEmail(buildRepDigest(input), { baseUrl: BASE }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omits amounts it cannot compute, and says so in the subject by leaving them out', () => {
    const input = lightWeekInput();
    input.rates = null;
    const email = renderWeeklyInstallsEmail(buildRepDigest(input), { baseUrl: BASE });
    expect(email.subject).toBe('Your installs last week: 1 installed');
    expect(email.html).not.toMatch(/\$\d/);
    expect(email.text).not.toMatch(/\$\d/);
    expect(email.html).toContain('Est. payout Sep 28–Oct 3');
  });

  it('writes a subject for a week with no installs', () => {
    const input = lightWeekInput();
    input.sales = input.sales.filter((sale) => sale.id === 'j2');
    const email = renderWeeklyInstallsEmail(buildRepDigest(input), { baseUrl: BASE });
    expect(email.subject).toBe('Your installs last week: none yet · 1 sale needs a date');
    expect(email.html).toContain('No installs landed last week.');
  });

  it('formats money and picks a public origin for links', () => {
    expect(money(420)).toBe('$420');
    expect(money(97.5)).toBe('$97.50');
    expect(money(1234.5)).toBe('$1,234.50');
    expect(emailBaseUrl(undefined)).toBe(BASE);
    expect(emailBaseUrl('http://localhost:3000')).toBe(BASE);
    expect(emailBaseUrl('https://www.3cworldgroup.com/')).toBe(BASE);
  });

  it('matches the plain-text snapshot', () => {
    expect(busy.text).toMatchSnapshot();
  });
});
