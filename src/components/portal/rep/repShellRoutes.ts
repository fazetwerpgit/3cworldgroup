// The portal sections that sit on the Direction D rep shell. RepShellHost (in
// the portal layout) mounts the shell once for every path under these, so the
// top bar, tab bar, live chat listeners and presence ping survive a tab switch.
// Every page under a listed section renders <RepShell>, which only registers
// the page's title, back link and permission gate with that one shell.
// Anything not listed (sign in, sign up, redirect stubs) renders bare.
export const REP_SHELL_SECTIONS = [
  'admin',
  'ask',
  'calls',
  'chat',
  'dashboard',
  'escalink',
  'expedite-order',
  'fiber-report',
  'forms',
  'leaderboard',
  'leads-request',
  'learn',
  'manager-interview',
  'onboarding',
  'payroll-dispute',
  'sales',
  'settings',
  'training',
] as const;

const SECTIONS = new Set<string>(REP_SHELL_SECTIONS);

/** True when this portal path renders inside the shared rep shell. */
export function isRepShellPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const match = /^\/portal\/([^/?#]+)/.exec(pathname);
  return !!match && SECTIONS.has(match[1]);
}
