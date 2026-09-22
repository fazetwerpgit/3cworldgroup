import { House, MessageSquare, Plus, ReceiptText, Trophy } from 'lucide-react';
import type { PortalNavItem } from '@/components/portal/CommandPalette';

// The D shell's primary destinations. Gates match portalNavGroups so a tab is
// never shown to someone the page would turn away.

export type RepTab = PortalNavItem & { short: string; log?: boolean };

export const REP_TABS: RepTab[] = [
  { label: 'Dashboard', short: 'Home', href: '/portal/dashboard', icon: House },
  { label: 'Sales', short: 'Sales', href: '/portal/sales', icon: ReceiptText, permissions: ['sales:read'] },
  { label: 'Log sale', short: 'Log sale', href: '/portal/sales/new', icon: Plus, permissions: ['sales:write'], log: true },
  { label: 'Leaderboard', short: 'Board', href: '/portal/leaderboard', icon: Trophy, permissions: ['leaderboard:read'] },
  { label: 'Chat', short: 'Chat', href: '/portal/chat', icon: MessageSquare, permissions: ['chat:read'] },
];

export const LOG_SALE_HREF = '/portal/sales/new';

/** Which primary destination the current path belongs to. Log sale wins over Sales. */
export function activeRepHref(pathname: string): string | null {
  if (pathname.startsWith(LOG_SALE_HREF)) return LOG_SALE_HREF;
  if (pathname === '/portal/dashboard') return '/portal/dashboard';
  const match = REP_TABS.find((tab) => tab.href !== '/portal/dashboard' && pathname.startsWith(tab.href));
  return match?.href ?? null;
}

/** Hrefs already on screen as tabs / top links, so the menu does not repeat them. */
export const REP_PRIMARY_HREFS = new Set(REP_TABS.map((tab) => tab.href));
