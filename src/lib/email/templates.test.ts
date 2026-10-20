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
  solarBookingConfirmationEmail,
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

describe('solarBookingConfirmationEmail', () => {
  const BASE = {
    customerName: 'Ana Lopez',
    when: 'Monday, October 26 at 8:00 AM PT',
    consultantName: 'Sam Closer',
  };
  const MEET = 'https://meet.google.com/abc-defg-hij';
  const ADDRESS = '12 Elm St, Austin, TX, 78701';

  it('virtual with a Meet link and phone: button, plain link, call-or-text line, invite note', () => {
    const e = solarBookingConfirmationEmail({
      ...BASE, mode: 'virtual', meetLink: MEET, consultantPhone: '+15125550142', address: ADDRESS, calendarAttached: true,
    });
    expect(e.subject).toBe('Your solar consultation is booked');
    expect(e.htmlBody).toContain(`<a href="${MEET}"`);
    expect(e.htmlBody).toContain('>Join on Google Meet</a>');
    expect(e.htmlBody).toContain(`>${MEET}</a>`);
    expect(e.htmlBody).toContain('Call or text Sam at <a href="tel:+15125550142"');
    expect(e.htmlBody).toContain('>(512) 555-0142</a>');
    expect(e.htmlBody).toContain('Monday, October 26 at 8:00 AM PT');
    expect(e.htmlBody).toContain('reply to this email');
    // The address only matters in person.
    expect(e.htmlBody).not.toContain('Elm St');
    expect(e.textBody).toBe(
      'Hi Ana Lopez,\n\nYou are booked for a virtual consultation with Sam Closer on Monday, October 26 at 8:00 AM PT.\n\n' +
        `Join on Google Meet: ${MEET}\n\nQuestions before then? Call or text Sam at (512) 555-0142.\n\n` +
        'To add it to your calendar, open the attached invite.\n\nIf you need to change the time, reply to this email.\n\n3C World Group\n'
    );
  });

  it('virtual without a link: no button, no Meet text, no empty paragraphs', () => {
    const e = solarBookingConfirmationEmail({ ...BASE, mode: 'virtual', meetLink: '', consultantPhone: '+15125550142' });
    expect(e.htmlBody).not.toMatch(/Google Meet|meet\.google|<p><\/p>|undefined/);
    expect(e.textBody).not.toMatch(/Google Meet|undefined|\n\n\n/);
    expect(e.textBody).toContain('Call or text Sam at (512) 555-0142.');
  });

  it('in person: the home address is where it happens, and a Meet link is never shown', () => {
    const e = solarBookingConfirmationEmail({ ...BASE, mode: 'in_person', meetLink: MEET, address: ADDRESS, consultantPhone: '+15125550142' });
    expect(e.textBody).toContain(`Where: ${ADDRESS}`);
    expect(e.htmlBody).toContain(`<strong>${ADDRESS}</strong>`);
    expect(e.htmlBody).not.toContain('meet.google.com');
    expect(e.textBody).toContain('in-person consultation with Sam Closer');
  });

  it('nothing set: just the booking line and the reply line', () => {
    const e = solarBookingConfirmationEmail({ ...BASE, customerName: '', mode: 'in_person' });
    expect(e.textBody).toBe(
      'Hi,\n\nYou are booked for an in-person consultation with Sam Closer on Monday, October 26 at 8:00 AM PT.\n\n' +
        'If you need to change the time, reply to this email.\n\n3C World Group\n'
    );
    expect(e.htmlBody).not.toMatch(/Where:|Call or text|tel:|invite|undefined|<p><\/p>/);
  });

  it('escapes every value in the html', () => {
    const e = solarBookingConfirmationEmail({
      customerName: '<b>Eve</b>',
      when: '<i>soon</i>',
      consultantName: 'Sam "<img src=x>"',
      mode: 'in_person',
      address: '1 <script>alert(1)</script> Way',
      consultantPhone: '+15125550142',
    });
    expect(e.htmlBody).not.toMatch(/<b>Eve|<i>soon|<img|<script/);
    expect(e.htmlBody).toContain('&lt;script&gt;');
  });
});

describe('managerAlertEmail action', () => {
  it('adds the action link above the portal link, in html and text', () => {
    const m = managerAlertEmail({
      title: 'Solar consult booked', message: 'Ana: virtual', link: 'https://portal.test/p',
      action: { label: 'Join on Google Meet', href: 'https://meet.google.com/abc-defg-hij' },
    });
    expect(m.htmlBody).toContain('<a href="https://meet.google.com/abc-defg-hij">Join on Google Meet</a>');
    expect(m.textBody).toContain('Join on Google Meet: https://meet.google.com/abc-defg-hij\n\nhttps://portal.test/p');
    expect(managerAlertEmail({ title: 'T', message: 'M', link: 'L' }).textBody).toBe('T\n\nM\n\nL\n');
  });
});
