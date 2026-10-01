import { House, MessageSquare, Plus, ReceiptText, Shield, Trophy } from 'lucide-react';
import type { PortalNavItem } from '@/components/portal/CommandPalette';
import { ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';

// The D shell's primary destinations. Gates match portalNavGroups so a tab is
// never shown to someone the page would turn away.

export type RepTab = PortalNavItem & {
  short: string;
  log?: boolean;
  /** Carries the combined open-items count (the owner's Admin tab). */
  waiting?: boolean;
};

export const REP_TABS: RepTab[] = [
  { label: 'Dashboard', short: 'Home', href: '/portal/dashboard', icon: House },
  { label: 'Sales', short: 'Sales', href: '/portal/sales', icon: ReceiptText, permissions: ['sales:read'] },
  { label: 'Log sale', short: 'Log sale', href: '/portal/sales/new', icon: Plus, permissions: ['sales:write'], log: true },
  { label: 'Leaderboard', short: 'Board', href: '/portal/leaderboard', icon: Trophy, permissions: ['leaderboard:read'] },
  { label: 'Chat', short: 'Chat', href: '/portal/chat', icon: MessageSquare, permissions: ['chat:read'] },
];

export const LOG_SALE_HREF = '/portal/sales/new';

/** Owners do not sell: their phone bar swaps the Log sale tab for Admin, which opens on Onboarding (the busiest queue). */
export const ADMIN_TAB: RepTab = {
  label: 'Admin',
  short: 'Admin',
  href: ONBOARDING_HUB.href,
  icon: Shield,
  roles: ['owner'],
  waiting: true,
};

/** The phone tab bar's destinations for this viewer (before the permission gate). */
export function repTabsFor(owner: boolean): RepTab[] {
  return owner ? [...REP_TABS.filter((tab) => !tab.log), ADMIN_TAB] : REP_TABS;
}

/** Which primary destination the current path belongs to. Log sale wins over Sales; every admin page is Admin. */
export function activeRepHref(pathname: string): string | null {
  if (pathname.startsWith(LOG_SALE_HREF)) return LOG_SALE_HREF;
  if (pathname === '/portal/dashboard') return '/portal/dashboard';
  if (pathname === '/portal/admin' || pathname.startsWith('/portal/admin/')) return ADMIN_TAB.href;
  const match = REP_TABS.find((tab) => tab.href !== '/portal/dashboard' && pathname.startsWith(tab.href));
  return match?.href ?? null;
}

/** Hrefs already on screen as tabs / top links, so the menu does not repeat them. */
export const REP_PRIMARY_HREFS = new Set(REP_TABS.map((tab) => tab.href));
