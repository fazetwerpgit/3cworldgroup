import { describe, expect, it } from 'vitest';
import type { ApplicationRecord } from '@/types';
import { emailProblem, exportRow, recruitRows, recruitSentence } from './recruitList';
import type { InviteView } from './Invites';

const NOW = new Date('2026-10-13T12:00:00').getTime();

function application(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'app-1',
    name: 'Jane Rep',
    phone: '2145550100',
    email: 'jane@example.com',
    city: 'Dallas',
    status: 'applied',
    createdAt: new Date('2026-10-13T09:00:00'),
    updatedAt: new Date('2026-10-13T09:00:00'),
    ...overrides,
  };
}

const source = (channel: NonNullable<ApplicationRecord['source']>['channel'], referrerHost = '') => ({
  referrerHost,
  landingPath: '/',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  channel,
});

describe('recruit source', () => {
  it('says how a new applicant found the site', () => {
    const [google] = recruitRows([application({ source: source('google', 'www.google.com') })], []);
    expect(recruitSentence(google, NOW)).toBe('Applied today · not invited yet · via Google');
    const [direct] = recruitRows([application({ source: source('direct') })], []);
    expect(recruitSentence(direct, NOW)).toBe('Applied today · not invited yet · came in direct');
    const [other] = recruitRows([application({ source: source('other', 'duckduckgo.com') })], []);
    expect(exportRow(other).source).toBe('duckduckgo.com');
  });

  it('says nothing about the source on an application from before tracking', () => {
    const [row] = recruitRows([application()], []);
    expect(recruitSentence(row, NOW)).toBe('Applied today · not invited yet');
    expect(exportRow(row).source).toBe('');
  });
});

describe('invite email status', () => {
  const invite = (overrides: Partial<InviteView> = {}): InviteView => ({
    id: 'inv-1',
    candidateName: 'Jane Rep',
    candidateEmail: 'jane@example.com',
    candidatePhone: '2145550100',
    candidateCity: 'Dallas',
    intendedFieldRole: 'entry_level_rep',
    isIBO: false,
    status: 'invited',
    linkSaved: true,
    ownerName: 'Owner',
    expiresAt: '2099-01-01T12:00:00', // shownStatus checks expiry against the real clock
    submittedAt: null,
    createdAt: '2026-10-11T09:00:00',
    ...overrides,
  });
  const line = (overrides: Partial<InviteView> = {}) => {
    const [row] = recruitRows([], [invite(overrides)]);
    return { text: recruitSentence(row, NOW), problem: emailProblem(row) };
  };

  it('says the invite was emailed, then delivered', () => {
    expect(line({ emailStatus: 'sent' })).toEqual({ text: "Invited Oct 11 · emailed · hasn't opened the link", problem: false });
    expect(line({ emailStatus: 'delivered' })).toEqual({ text: "Invited Oct 11 · delivered · hasn't opened the link", problem: false });
  });

  it('flags an email that bounced or never went out', () => {
    expect(line({ emailStatus: 'bounced' })).toEqual({ text: "Invited Oct 11 · email bounced · hasn't opened the link", problem: true });
    expect(line({ emailStatus: 'failed' })).toEqual({ text: "Invited Oct 11 · email didn't go out · hasn't opened the link", problem: true });
  });

  it('leaves an invite from before email status exactly as it was', () => {
    expect(line()).toEqual({ text: "Invited Oct 11 · hasn't opened the link", problem: false });
    expect(line({ emailStatus: null })).toEqual({ text: "Invited Oct 11 · hasn't opened the link", problem: false });
  });

  it('lets opened, finished and expired invites say what they always said', () => {
    expect(line({ status: 'in_progress', emailStatus: 'bounced' })).toEqual({ text: 'Invited Oct 11 · started their paperwork', problem: false });
    expect(line({ status: 'invited', emailStatus: 'failed', expiresAt: '2026-10-12T00:00:00' })).toEqual({ text: 'Invited Oct 11 · the link ran out', problem: false });
    expect(line({ status: 'submitted', emailStatus: 'bounced', submittedAt: '2026-10-12T10:00:00' }).text).toBe(
      'Finished their paperwork Oct 12 · ready to activate'
    );
    expect(line({ status: 'converted', emailStatus: 'delivered' }).text).toBe('Joined the team');
  });
});
