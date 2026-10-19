// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { portalNavTarget } from './useOfflineNavGuard';

const HERE = 'https://www.3cworldgroup.com/portal/dashboard';

function clickOn(href: string | null, init: MouseEventInit = {}, attrs: Record<string, string> = {}): MouseEvent {
  const a = document.createElement('a');
  if (href !== null) a.setAttribute('href', href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  const span = document.createElement('span');
  a.appendChild(span);
  document.body.appendChild(a);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, 'target', { value: span });
  a.remove();
  return event;
}

describe('portalNavTarget', () => {
  it('returns the portal page an ordinary link opens', () => {
    expect(portalNavTarget(clickOn('/portal/leaderboard'), HERE)).toBe('/portal/leaderboard');
    expect(portalNavTarget(clickOn('/portal/learn?tab=training'), HERE)).toBe('/portal/learn?tab=training');
  });

  it('ignores other sites, the public site, the page on screen, new tabs, downloads and modified clicks', () => {
    expect(portalNavTarget(clickOn('https://example.com/portal/x'), HERE)).toBeNull();
    expect(portalNavTarget(clickOn('/privacy'), HERE)).toBeNull();
    expect(portalNavTarget(clickOn('/portal/dashboard#top'), HERE)).toBeNull();
    expect(portalNavTarget(clickOn('/portal/sales', {}, { target: '_blank' }), HERE)).toBeNull();
    expect(portalNavTarget(clickOn('/portal/sales', {}, { download: '' }), HERE)).toBeNull();
    expect(portalNavTarget(clickOn('/portal/sales', { metaKey: true }), HERE)).toBeNull();
    expect(portalNavTarget(clickOn(null), HERE)).toBeNull();
  });
});
