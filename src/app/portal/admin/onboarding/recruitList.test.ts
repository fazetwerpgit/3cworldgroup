import { describe, expect, it } from 'vitest';
import type { ApplicationRecord } from '@/types';
import { exportRow, recruitRows, recruitSentence } from './recruitList';

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
