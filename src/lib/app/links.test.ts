import { describe, expect, it } from 'vitest';
import { classifyLink, inAppRoute } from './links';

const HERE = 'https://www.3cworldgroup.com/portal/dashboard';

describe('classifyLink', () => {
  it('keeps same-host links in the WebView', () => {
    expect(classifyLink('/portal/sales', HERE)).toEqual({ kind: 'internal', url: 'https://www.3cworldgroup.com/portal/sales' });
    expect(classifyLink('https://www.3cworldgroup.com/privacy', HERE).kind).toBe('internal');
  });

  it('sends other sites, Meet and signed file links to the shell', () => {
    expect(classifyLink('https://meet.google.com/abc-defg-hij', HERE)).toEqual({
      kind: 'external',
      url: 'https://meet.google.com/abc-defg-hij',
    });
    expect(classifyLink('https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?token=1', HERE).kind).toBe('external');
    // A different host is external even on our own domain.
    expect(classifyLink('https://3cworldgroup.com/portal', HERE).kind).toBe('external');
  });

  it('sends tel:, mailto: and sms: to the shell', () => {
    expect(classifyLink('tel:+15551234567', HERE)).toEqual({ kind: 'external', url: 'tel:+15551234567' });
    expect(classifyLink('mailto:privacy@3cworldgroup.com', HERE).kind).toBe('external');
    expect(classifyLink('sms:+15551234567', HERE).kind).toBe('external');
  });

  it('leaves fragments, blob/data/javascript URLs and junk alone', () => {
    expect(classifyLink('#section', HERE)).toEqual({ kind: 'ignore' });
    expect(classifyLink('blob:https://www.3cworldgroup.com/123', HERE)).toEqual({ kind: 'ignore' });
    expect(classifyLink('data:text/csv,a', HERE)).toEqual({ kind: 'ignore' });
    expect(classifyLink('javascript:void(0)', HERE)).toEqual({ kind: 'ignore' });
    expect(classifyLink('', HERE)).toEqual({ kind: 'ignore' });
    expect(classifyLink(null, HERE)).toEqual({ kind: 'ignore' });
  });
});

describe('inAppRoute', () => {
  it('returns the router path for a portal page on this origin', () => {
    expect(inAppRoute('https://www.3cworldgroup.com/portal/chat?channel=all-company', HERE)).toBe('/portal/chat?channel=all-company');
    expect(inAppRoute('/portal/announcements#latest', HERE)).toBe('/portal/announcements#latest');
    expect(inAppRoute('/portal', HERE)).toBe('/portal');
  });

  it('refuses other origins, non-portal pages and junk', () => {
    expect(inAppRoute('https://evil.example/portal/chat', HERE)).toBeNull();
    expect(inAppRoute('http://www.3cworldgroup.com/portal/chat', HERE)).toBeNull();
    expect(inAppRoute('/privacy', HERE)).toBeNull();
    expect(inAppRoute('/portalx', HERE)).toBeNull();
    expect(inAppRoute('javascript:alert(1)', HERE)).toBeNull();
  });
});
