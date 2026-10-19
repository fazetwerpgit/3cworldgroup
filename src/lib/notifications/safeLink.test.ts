import { describe, expect, it } from 'vitest';
import { safeNotificationLink } from './safeLink';

describe('safeNotificationLink', () => {
  it.each([
    '/portal',
    '/portal/sales/abc',
    '/portal/admin/requests?type=bug-reports',
    '/portal#top',
  ])('keeps the portal path %s', (link) => {
    expect(safeNotificationLink(link)).toBe(link);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:fetch(`/api/portal/owner/summary`)',
    ' javascript:alert(1)',
    'https://evil.example/portal',
    '//evil.example/portal',
    '/\\evil.example',
    '/portal\\..\\..\\evil',
    '/portal/\tx',
    '/portalfoo',
    '/dashboard',
    'portal/sales',
    'data:text/html,hi',
    '',
    null,
    undefined,
    42,
    {},
  ])('rejects %j', (link) => {
    expect(safeNotificationLink(link)).toBeNull();
  });
});
