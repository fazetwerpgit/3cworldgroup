// A document title per portal page. The portal's pages are client components
// under one layout, so they all inherited "Employee Portal | 3C World Group";
// Next's route announcer only speaks when the title changes, so VoiceOver
// heard nothing on a tab switch. PortalDocumentTitle applies these.

const SUFFIX = ' | 3C World Group';

const EXACT: Record<string, string> = {
  '/portal': 'Sign in',
  '/portal/signup': 'Create account',
  '/portal/dashboard': 'Dashboard',
  '/portal/sales': 'Sales',
  '/portal/sales/new': 'Log sale',
  '/portal/sales/new/bulk': 'Log several sales',
  '/portal/leaderboard': 'Leaderboard',
  '/portal/chat': 'Team chat',
  '/portal/learn': 'Learn',
  '/portal/shorts': 'Short videos',
  '/portal/ask': 'Ask 3C',
  '/portal/calls': 'Team calls',
  '/portal/settings': 'Settings',
  '/portal/forms': 'Forms',
  '/portal/escalink': 'Escalink',
  '/portal/expedite-order': 'Expedite order',
  '/portal/fiber-report': 'Fiber report',
  '/portal/leads-request': 'Leads request',
  '/portal/manager-interview': 'Manager interview',
  '/portal/payroll-dispute': 'Payroll dispute',
  '/portal/links': 'Links',
  '/portal/pay-structure': 'Pay structure',
  '/portal/onboarding': 'Onboarding',
  '/portal/solar': 'Solar',
  '/portal/solar/present': 'Solar deck',
  '/portal/admin/announcements': 'Announcements · Admin',
  '/portal/admin/chat-reports': 'Chat reports · Admin',
  '/portal/admin/onboarding': 'Onboarding · Admin',
  '/portal/admin/people': 'People · Admin',
  '/portal/admin/requests': 'Requests · Admin',
  '/portal/admin/settings': 'Settings · Admin',
  '/portal/admin/solar': 'Solar · Admin',
};

const PATTERNS: [RegExp, string][] = [
  [/^\/portal\/sales\/[^/]+\/edit$/, 'Edit sale'],
  [/^\/portal\/sales\/[^/]+$/, 'Sale'],
  [/^\/portal\/training\/[^/]+$/, 'Training module'],
  [/^\/portal\/onboarding\/sign\/[^/]+$/, 'Sign documents'],
  [/^\/portal\/admin\/users\/[^/]+$/, 'Person · Admin'],
];

/** The page's name ("Sales"), or null for a path that is not a known portal page. */
export function portalPageName(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (EXACT[path]) return EXACT[path];
  for (const [pattern, name] of PATTERNS) if (pattern.test(path)) return name;
  return null;
}

/** The full document title ("Sales | 3C World Group"), or null to leave the page's own. */
export function portalDocumentTitle(pathname: string | null | undefined): string | null {
  const name = portalPageName(pathname);
  return name ? `${name}${SUFFIX}` : null;
}
