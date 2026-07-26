import { roleRequiresOnboarding, type FieldRole } from '@/types/auth';

// SINGLE SOURCE OF TRUTH for what a hire who has not finished onboarding may
// reach. Three consumers read these lists: the portal guard
// (components/portal/OnboardingGate.tsx), the navigation components, and the
// server-side status gate (lib/auth/requireVerifiedAdmin.ts). Adding a route a
// hire needs means adding ONE line here — nowhere else gets an opinion, which
// is what stops the client and the server drifting apart.
//
// Being listed relaxes ONLY the account-status check. It grants no permission a
// rep does not already hold, so an admin-only method on a listed path stays
// closed to a hire through its own role check.

export const ONBOARDING_ALLOWED_PAGES: readonly string[] = [
  '/portal/onboarding',
  '/portal/chat',
  '/portal/training',
  '/portal/resources',
  '/portal/calls',
  '/portal/settings',
];

// Chat is enumerated route by route rather than as a prefix: creating channels,
// syncing them and managing membership are administration and keep their own
// management gates.
export const ONBOARDING_ALLOWED_APIS: readonly string[] = [
  '/api/portal/onboarding',
  '/api/portal/training',
  '/api/portal/commission',
  '/api/portal/calls',
  '/api/portal/notifications',
  '/api/portal/profile',
  '/api/portal/presence',
  '/api/portal/push/register',
  '/api/portal/chat/channels',
  '/api/portal/chat/gifs',
  '/api/portal/chat/media',
  '/api/portal/chat/messages',
  '/api/portal/chat/messages/pin',
  '/api/portal/chat/reactions',
];

// Listed prefixes that must NOT match, even though a listed prefix covers them.
// `/api/portal/chat/channels` legitimately covers `/…/channels/{id}/members`,
// so the administrative sub-routes are subtracted explicitly.
const DENIED_API_PATHS: readonly string[] = [
  '/api/portal/chat/channels/manage',
  '/api/portal/chat/channels/sync',
];

// Denied when the path matches this shape: /api/portal/chat/channels/<id>/members/manage
const DENIED_API_PATTERNS: readonly RegExp[] = [
  /^\/api\/portal\/chat\/channels\/[^/]+\/members\/manage$/,
];

function normalize(pathname: string): string {
  const [withoutQuery] = pathname.split('?');
  return withoutQuery.length > 1 && withoutQuery.endsWith('/')
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

// Segment-aware prefix match. `/portal/training` must cover
// `/portal/training/abc` but never `/portal/trainingfoo`.
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isOnboardingAllowedPage(pathname: string): boolean {
  const path = normalize(pathname);
  return ONBOARDING_ALLOWED_PAGES.some((prefix) => matchesPrefix(path, prefix));
}

export function isOnboardingAllowedApi(pathname: string): boolean {
  const path = normalize(pathname);
  if (DENIED_API_PATHS.some((denied) => matchesPrefix(path, denied))) return false;
  if (DENIED_API_PATTERNS.some((pattern) => pattern.test(path))) return false;
  return ONBOARDING_ALLOWED_APIS.some((prefix) => matchesPrefix(path, prefix));
}

// The one definition of "still onboarding", shared by client guard and server
// gate so the two can never disagree about who it applies to.
export function isOnboardingUser(
  user: { status?: string | null; fieldRole?: FieldRole | null } | null | undefined
): boolean {
  if (!user) return false;
  if (user.status !== 'pending') return false;
  return roleRequiresOnboarding(user.fieldRole ?? undefined);
}
