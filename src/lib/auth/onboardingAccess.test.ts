import { readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  it('normalizes query strings, fragments, repeated slashes, and case', () => {
    expect(isOnboardingAllowedPage('/PORTAL//CHAT////?tab=general#messages')).toBe(true);
    expect(isOnboardingAllowedPage('/portal/chat#messages?tab=general')).toBe(true);
  });

  it('fails closed for non-string and empty pathnames', () => {
    expect(isOnboardingAllowedPage(null)).toBe(false);
    expect(isOnboardingAllowedPage(undefined)).toBe(false);
    expect(isOnboardingAllowedPage('')).toBe(false);
    expect(isOnboardingAllowedPage('api/portal/chat')).toBe(false);
  });

  it('fails closed for traversal and encoded path shapes', () => {
    for (const pathname of [
      '/api/portal/chat/channels/../sales',
      '/api/portal/chat/channels/../../sales/stats',
      '/portal/settings/../../admin',
      '/api/portal/chat/channels/%6Danage',
      '/api/portal/chat/channels/MANAGE',
    ]) {
      expect(isOnboardingAllowedPage(pathname), pathname).toBe(false);
    }
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

  it('normalizes query strings, fragments, repeated slashes, and case', () => {
    expect(isOnboardingAllowedApi('/API//PORTAL//TRAINING////?view=all#progress')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/training#progress?view=all')).toBe(true);
  });

  it('fails closed for non-string, empty, and relative pathnames', () => {
    expect(isOnboardingAllowedApi(null)).toBe(false);
    expect(isOnboardingAllowedApi(undefined)).toBe(false);
    expect(isOnboardingAllowedApi('')).toBe(false);
    expect(isOnboardingAllowedApi('api/portal/training')).toBe(false);
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

  it('denies every non-canonical shape of the channel membership admin route', () => {
    for (const pathname of [
      '/api/portal/chat/channels/c1/members/manage//',
      '/api/portal/chat/channels/c1//members/manage',
      '/api/portal/chat/channels//manage',
      '/api/portal/chat/channels/c1/members/manage/extra',
    ]) {
      expect(isOnboardingAllowedApi(pathname), pathname).toBe(false);
    }
  });

  it('fails closed for traversal, encoded, and case-variant path shapes', () => {
    for (const pathname of [
      '/api/portal/chat/channels/../sales',
      '/api/portal/chat/channels/../../sales/stats',
      '/portal/settings/../../admin',
      '/api/portal/chat/channels/%6Danage',
      '/api/portal/chat/channels/MANAGE',
    ]) {
      expect(isOnboardingAllowedApi(pathname), pathname).toBe(false);
    }
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

  it('is false for internal and office roles even while pending', () => {
    expect(isOnboardingUser({ status: 'pending', fieldRole: 'general_manager' })).toBe(false);
    expect(isOnboardingUser({ status: 'pending', fieldRole: 'gm_in_training' })).toBe(false);
    expect(isOnboardingUser({ status: 'pending', fieldRole: 'office_manager' })).toBe(false);
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
    for (const page of Object.keys(PAGE_API_DEPENDENCIES)) {
      expect(ONBOARDING_ALLOWED_PAGES).toContain(page);
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

// These are intentional descendants of an allowlisted prefix. Each route has
// its own requester/channel-access or management gate in the route file.
const ALLOWED_SUBPATHS = [
  // onboarding/submit has requireVerifiedSelfOrManagement(..., { allowOnboarding: true }).
  '/api/portal/onboarding/submit',
  // onboarding/upload has requireVerifiedSelfOrManagement(..., { allowOnboarding: true }).
  '/api/portal/onboarding/upload',
  // onboarding/review has requireVerifiedManagement on GET and POST.
  '/api/portal/onboarding/review',
  // onboarding/activate has requireVerifiedManagement before activation.
  '/api/portal/onboarding/activate',
  // chat channel media has getVerifiedChatUser plus userCanAccessChannelDoc.
  '/api/portal/chat/channels/x/media',
  // chat channel members has getVerifiedChatUser plus userCanAccessChannelDoc.
  '/api/portal/chat/channels/x/members',
  // training detail has requireVerifiedRequester(..., { allowOnboarding: true }).
  '/api/portal/training/x',
  // training progress has requireVerifiedSelfOrManagement(..., { allowOnboarding: true }).
  '/api/portal/training/progress',
] as const satisfies readonly string[];

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/api');
const PORTAL_API_ROOT = resolve(API_ROOT, 'portal');

function discoverApiRoutePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return discoverApiRoutePaths(resolve(directory, entry.name));
    if (!entry.isFile() || entry.name !== 'route.ts') return [];

    const routeDirectory = relative(API_ROOT, directory).split(sep).filter(Boolean);
    const concreteSegments = routeDirectory.map((segment) =>
      /^\[[^/]+\]$/.test(segment) ? 'x' : segment
    );
    return [`/${['api', ...concreteSegments].join('/')}`];
  });
}

describe('API route tree classification', () => {
  it('classifies every route that an allowed prefix would reach', () => {
    const explicitPaths = new Set<string>([
      ...ONBOARDING_ALLOWED_APIS,
      ...ALLOWED_SUBPATHS,
    ]);

    for (const routePath of discoverApiRoutePaths(PORTAL_API_ROOT).sort()) {
      if (!isOnboardingAllowedApi(routePath)) continue;
      expect(
        explicitPaths.has(routePath),
        `${routePath} is a new route under an allowed prefix; classify it in src/lib/auth/onboardingAccess.ts before it can ship.`
      ).toBe(true);
    }
  });
});
