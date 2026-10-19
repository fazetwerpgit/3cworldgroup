// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installViewAsFetch, viewAsDecision } from './viewAsFetch';

const ORIGIN = 'http://localhost:3000';

function headerOf(decision: ReturnType<typeof viewAsDecision>): string | null {
  if (decision.kind !== 'header') return null;
  return new Headers(decision.init.headers).get('x-view-as');
}

describe('viewAsDecision', () => {
  it('adds x-view-as to GETs of the rep endpoints the in-scope screens read', () => {
    for (const url of [
      '/api/portal/sales?salesRepId=rep-noah&limit=500',
      '/api/portal/sales/status',
      '/api/portal/sales/status?fresh=1',
      '/api/portal/sales/callouts',
      '/api/portal/sales/sale-123',
      '/api/portal/comp-plan',
      '/api/portal/leaderboard?period=week&metric=totalPoints&limit=100',
      '/api/portal/solar/leaderboard?period=week&metric=bookedConsults&limit=100',
      '/api/portal/calls',
      '/api/portal/onboarding?userId=rep-noah',
      `${ORIGIN}/api/portal/sales`,
    ]) {
      expect(headerOf(viewAsDecision(url, undefined, 'rep-noah', ORIGIN)), url).toBe('rep-noah');
    }
  });

  it('keeps the request headers it was given (the token)', () => {
    const decision = viewAsDecision(
      '/api/portal/sales',
      { headers: { Authorization: 'Bearer t' } },
      'rep-noah',
      ORIGIN
    );
    expect(decision.kind).toBe('header');
    const headers = new Headers(decision.kind === 'header' ? decision.init.headers : undefined);
    expect(headers.get('authorization')).toBe('Bearer t');
    expect(headers.get('x-view-as')).toBe('rep-noah');
  });

  it('never adds the header to a write: writes to the rep endpoints are blocked instead', () => {
    for (const [url, method] of [
      ['/api/portal/sales', 'POST'],
      ['/api/portal/sales/sale-1', 'PUT'],
      ['/api/portal/sales/sale-1', 'DELETE'],
      ['/api/portal/sales/sale-1/install-date', 'PATCH'],
      ['/api/portal/sales/scan', 'POST'],
      ['/api/portal/onboarding/submit', 'POST'],
    ] as const) {
      expect(viewAsDecision(url, { method }, 'rep-noah', ORIGIN), `${method} ${url}`).toEqual({ kind: 'block' });
    }
  });

  it('leaves the owner’s own requests alone (chat, notifications, push, presence, admin)', () => {
    for (const [url, method] of [
      ['/api/portal/chat/messages', 'POST'],
      ['/api/portal/notifications', 'GET'],
      ['/api/portal/presence', 'POST'],
      ['/api/portal/push', 'POST'],
      ['/api/portal/owner/summary', 'GET'],
      ['/api/portal/settings/weekly-challenge', 'GET'],
      ['/api/portal/sales/company-stats', 'GET'],
      ['/api/portal/forms/attachment?path=x', 'GET'],
      ['https://firestore.googleapis.com/v1/x', 'GET'],
    ] as const) {
      expect(viewAsDecision(url, { method }, 'rep-noah', ORIGIN), `${method} ${url}`).toEqual({ kind: 'pass' });
    }
  });

  it('reads the method and URL off a Request', () => {
    const get = new Request(`${ORIGIN}/api/portal/comp-plan`);
    expect(headerOf(viewAsDecision(get, undefined, 'rep-noah', ORIGIN))).toBe('rep-noah');
    const post = new Request(`${ORIGIN}/api/portal/sales`, { method: 'POST' });
    expect(viewAsDecision(post, undefined, 'rep-noah', ORIGIN)).toEqual({ kind: 'block' });
  });
});

describe('installViewAsFetch', () => {
  const realFetch = window.fetch;
  afterEach(() => {
    window.fetch = realFetch;
  });

  it('wraps fetch while installed and restores it after', async () => {
    const base = vi.fn(async () => new Response('{}'));
    window.fetch = base as unknown as typeof fetch;

    const uninstall = installViewAsFetch('rep-noah');
    expect(window.fetch).not.toBe(base);

    await window.fetch('/api/portal/sales');
    const init = (base.mock.calls[0] as unknown as [unknown, RequestInit])[1];
    expect(new Headers(init.headers).get('x-view-as')).toBe('rep-noah');

    const blocked = await window.fetch('/api/portal/sales', { method: 'POST' });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: 'Read-only view' });
    expect(base).toHaveBeenCalledTimes(1);

    await window.fetch('/api/portal/presence', { method: 'POST' });
    expect(base).toHaveBeenCalledTimes(2);

    uninstall();
    expect(window.fetch).toBe(base);
  });
});
