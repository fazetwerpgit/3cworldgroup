import { describe, it, expect } from 'vitest';
import {
  inviteEmail,
  nudgeEmail,
  checklistReadyEmail,
  activationEmail,
  managerAlertEmail,
  esignSentEmail,
  formSubmissionEmail,
  itemRejectedEmail,
  ownerDocSignedEmail,
} from './templates';

describe('email templates', () => {
  it('invite email links the invite URL from the button and the text body', () => {
    const e = inviteEmail({ inviteUrl: 'https://portal.test/onboard/tok123' });
    expect(e.htmlBody).toContain('href="https://portal.test/onboard/tok123"');
    expect(e.textBody).toContain('https://portal.test/onboard/tok123');
  });

  it('nudge email escalates tone by tier', () => {
    const h24 = nudgeEmail({ name: 'Sam', tier: 'h24', portalUrl: 'https://portal.test/portal/onboarding' });
    const d7 = nudgeEmail({ name: 'Sam', tier: 'd7', portalUrl: 'https://portal.test/portal/onboarding' });
    expect(h24.subject).not.toEqual(d7.subject);
    expect(d7.htmlBody).toContain('https://portal.test/portal/onboarding');
  });

  it('checklist ready email contains the onboarding URL in html and text', () => {
    const e = checklistReadyEmail({
      name: 'Sam',
      portalUrl: 'https://portal.test/portal/onboarding',
    });
    expect(e.subject).toBe('Your onboarding checklist is ready');
    expect(e.htmlBody).toContain('https://portal.test/portal/onboarding');
    expect(e.textBody).toContain('https://portal.test/portal/onboarding');
  });

  it('esignSentEmail points to in-portal signing', () => {
    const c = esignSentEmail({ name: 'Ana', docLabels: ['Contract'], portalUrl: 'https://x/portal/onboarding' });
    expect(c.subject).toBe('Your documents are ready to sign');
    expect(c.textBody).toContain('https://x/portal/onboarding');
    expect(c.textBody).not.toMatch(/emailed you/i);
  });

  it('activation and manager alert emails render', () => {
    expect(activationEmail({ name: 'Sam' }).subject.length).toBeGreaterThan(0);
    const m = managerAlertEmail({ title: 'Review needed', message: 'W-9 uploaded', link: 'https://portal.test/portal/admin/onboarding' });
    expect(m.htmlBody).toContain('Review needed');
  });

  it('escapes user-supplied values in html bodies and keeps text bodies plain', () => {
    const name = 'Eve <a href="https://evil.test">Review now</a><img src=x>';
    const form = formSubmissionEmail({ formName: 'Job Application', submittedBy: `${name} (<b>Dallas</b>)`, link: 'https://portal.test/r' });
    const rejected = itemRejectedEmail({ name, itemLabel: '<b>W-9</b>', reason: '<img src=x>', portalUrl: 'https://portal.test/p' });
    const signed = ownerDocSignedEmail({ repName: name, itemLabel: 'W-9', link: 'https://portal.test/p' });
    const alert = managerAlertEmail({ title: '<i>T</i>', message: name, link: 'https://portal.test/p' });
    for (const e of [form, rejected, signed, alert, nudgeEmail({ name, tier: 'h24', portalUrl: 'https://portal.test/p' })]) {
      expect(e.htmlBody).not.toMatch(/<a href="https:\/\/evil|<img|<b>|<i>/);
    }
    expect(form.htmlBody).toContain('Eve &lt;a href=&quot;https://evil.test&quot;&gt;Review now&lt;/a&gt;&lt;img src=x&gt; (&lt;b&gt;Dallas&lt;/b&gt;)');
    expect(form.textBody).toContain(`${name} (<b>Dallas</b>)`);
  });
});
