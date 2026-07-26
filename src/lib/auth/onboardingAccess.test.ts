import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ALLOWED_APIS,
  ONBOARDING_ALLOWED_PAGES,
  isOnboardingAllowedApi,
  isOnboardingAllowedPage,
  isOnboardingUser,
} from './onboardingAccess';

describe('isOnboardingAllowedPage', () => {
  it('allows every listed page', () => {
    for (const page of ONBOARDING_ALLOWED_PAGES) {
      expect(isOnboardingAllowedPage(page)).toBe(true);
    }
  });

  it('allows sub-paths of a listed page', () => {
    expect(isOnboardingAllowedPage('/portal/training/abc123')).toBe(true);
    expect(isOnboardingAllowedPage('/portal/chat/general')).toBe(true);
  });

  it('does not allow a page whose name merely starts with an allowed one', () => {
    expect(isOnboardingAllowedPage('/portal/trainingfoo')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/callsomething')).toBe(false);
  });

  it('blocks the pages the client excluded', () => {
    expect(isOnboardingAllowedPage('/portal/dashboard')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/leaderboard')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/sales')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/forms')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/admin')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/admin/users')).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(isOnboardingAllowedPage('/portal/chat/')).toBe(true);
  });
});

describe('isOnboardingAllowedApi', () => {
  it('allows every listed api', () => {
    for (const api of ONBOARDING_ALLOWED_APIS) {
      expect(isOnboardingAllowedApi(api)).toBe(true);
    }
  });

  it('allows sub-paths of a listed api', () => {
    expect(isOnboardingAllowedApi('/api/portal/onboarding/submit')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/onboarding/upload')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/training/progress')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/training/res-1')).toBe(true);
  });

  it('blocks the three routes that must close', () => {
    expect(isOnboardingAllowedApi('/api/portal/leaderboard')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/sales')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/sales/stats')).toBe(false);
  });

  it('blocks chat administration but allows chat participation', () => {
    expect(isOnboardingAllowedApi('/api/portal/chat/messages')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/reactions')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/manage')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/sync')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/c1/members')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/c1/members/manage')).toBe(false);
  });

  it('blocks admin apis', () => {
    expect(isOnboardingAllowedApi('/api/portal/auth/users')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/forms')).toBe(false);
  });
});

describe('isOnboardingUser', () => {
  it('is true for a pending hire holding a field role', () => {
    expect(isOnboardingUser({ status: 'pending', fieldRole: 'entry_level_rep' })).toBe(true);
  });

  it('is false for an unapproved self-signup with no field role', () => {
    expect(isOnboardingUser({ status: 'pending' })).toBe(false);
    expect(isOnboardingUser({ status: 'pending', fieldRole: null })).toBe(false);
  });

  it('is false for an active user', () => {
    expect(isOnboardingUser({ status: 'active', fieldRole: 'entry_level_rep' })).toBe(false);
  });

  it('is false for a deactivated user', () => {
    expect(isOnboardingUser({ status: 'inactive', fieldRole: 'entry_level_rep' })).toBe(false);
  });

  it('is false for null or undefined', () => {
    expect(isOnboardingUser(null)).toBe(false);
    expect(isOnboardingUser(undefined)).toBe(false);
  });
});

// Which APIs each allowed page depends on. Maintained here deliberately: the
// assertion below is only as good as this map, so it must be readable and
// reviewable in one place. When you add a page to ONBOARDING_ALLOWED_PAGES,
// add its API dependencies here — this test will fail until you do.
const PAGE_API_DEPENDENCIES: Record<string, string[]> = {
  '/portal/onboarding': ['/api/portal/onboarding', '/api/portal/onboarding/submit', '/api/portal/onboarding/upload'],
  '/portal/chat': ['/api/portal/chat/channels', '/api/portal/chat/gifs', '/api/portal/chat/media', '/api/portal/chat/messages', '/api/portal/chat/messages/pin', '/api/portal/chat/reactions'],
  '/portal/training': ['/api/portal/training', '/api/portal/training/progress'],
  '/portal/resources': ['/api/portal/commission'],
  '/portal/calls': ['/api/portal/calls'],
  '/portal/settings': ['/api/portal/profile'],
};

describe('page and api allowlists agree', () => {
  it('covers every allowed page in the dependency map', () => {
    for (const page of ONBOARDING_ALLOWED_PAGES) {
      expect(Object.keys(PAGE_API_DEPENDENCIES)).toContain(page);
    }
  });

  it('allows every api that an allowed page depends on', () => {
    for (const [page, apis] of Object.entries(PAGE_API_DEPENDENCIES)) {
      for (const api of apis) {
        expect(
          isOnboardingAllowedApi(api),
          `${page} depends on ${api}, which is not allowlisted`
        ).toBe(true);
      }
    }
  });

  it('allows no api whose only consumer would be a blocked page', () => {
    // Shell-wide APIs are reachable from every page and so have no single
    // consumer; everything else must be justified by the map above.
    const SHELL_WIDE = ['/api/portal/notifications', '/api/portal/presence', '/api/portal/push/register'];
    const depended = new Set(Object.values(PAGE_API_DEPENDENCIES).flat());
    for (const api of ONBOARDING_ALLOWED_APIS) {
      if (SHELL_WIDE.includes(api)) continue;
      const justified = [...depended].some(
        (dep) => dep === api || dep.startsWith(`${api}/`)
      );
      expect(justified, `${api} is allowlisted but no allowed page uses it`).toBe(true);
    }
  });
});
