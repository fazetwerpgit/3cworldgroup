import { describe, it, expect } from 'vitest';
import {
  inviteEmail,
  nudgeEmail,
  checklistReadyEmail,
  activationEmail,
  managerAlertEmail,
  esignSentEmail,
} from './templates';

describe('email templates', () => {
  it('invite email contains the invite URL in html and text', () => {
    const e = inviteEmail({
      candidateName: 'Sam',
      ownerName: 'Jacob',
      inviteUrl: 'https://portal.test/onboard/tok123',
    });
    expect(e.subject.toLowerCase()).toContain('welcome');
    expect(e.htmlBody).toContain('https://portal.test/onboard/tok123');
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
});
