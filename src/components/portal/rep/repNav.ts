import { House, MessageSquare, Plus, ReceiptText, Shield, Sun, Trophy } from 'lucide-react';
import type { PortalNavItem } from '@/components/portal/CommandPalette';
import { ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';

// The D shell's primary destinations. Gates match portalNavGroups so a tab is
// never shown to someone the page would turn away.

export type RepTab = PortalNavItem & {
  short: string;
  /** The bar's center action (Log sale; a solar-only rep's Solar): no desktop top link, the desktop CTA instead. */
  log?: boolean;
  /** Drawn as the bar's lime center action (Log sale; a solar-only rep's Solar). */
  emphasis?: boolean;
  /** Carries the combined open-items count (the owner's Admin tab). */
  waiting?: boolean;
};

export const REP_TABS: RepTab[] = [
  { label: 'Dashboard', short: 'Home', href: '/portal/dashboard', icon: House },
  { label: 'Sales', short: 'Sales', href: '/portal/sales', icon: ReceiptText, permissions: ['sales:read'] },
  { label: 'Log sale', short: 'Log sale', href: '/portal/sales/new', icon: Plus, permissions: ['sales:write'], log: true, emphasis: true },
  { label: 'Leaderboard', short: 'Board', href: '/portal/leaderboard', icon: Trophy, permissions: ['leaderboard:read'] },
  { label: 'Chat', short: 'Chat', href: '/portal/chat', icon: MessageSquare, permissions: ['chat:read'] },
];

export const LOG_SALE_HREF = '/portal/sales/new';

/** Ask 3C: one tap from the top bar for whoever it is open to. */
export const ASK_HREF = '/portal/ask';

/** Owners do not sell: their phone bar swaps the Log sale tab for Admin, which opens on Onboarding (the busiest queue). */
export const ADMIN_TAB: RepTab = {
  label: 'Admin',
  short: 'Admin',
  href: ONBOARDING_HUB.href,
  icon: Shield,
  roles: ['owner'],
  waiting: true,
};

export const SOLAR_HREF = '/portal/solar';

/** The solar deck itself (full screen, no shell): what a solar rep opens at the door. */
export const SOLAR_DECK_HREF = '/portal/solar/present';

/**
 * A solar-only rep's center tab, where a fiber rep has Log sale: the solar
 * deck itself, opened in one tap the way Log sale opens its flow. The same
 * lime emphasis. (The Solar page, /portal/solar, stays a route: the deck's
 * Exit and the menu lead there.)
 */
export const SOLAR_TAB: RepTab = {
  label: 'Solar',
  short: 'Solar',
  href: SOLAR_DECK_HREF,
  icon: Sun,
  permissions: ['solar:write'],
  log: true,
  emphasis: true,
};

/** Who may open the Sales tab: a fiber seller, or a solar rep (their Sales is My leads). */
export const FIBER_SALES_PERMISSIONS = ['sales:read'];
export const SOLAR_SALES_PERMISSIONS = ['solar:read'];

/** A solar-only rep's Sales tab: their solar leads, so it is gated on solar:read. */
export const SOLAR_SALES_TAB: RepTab = { ...REP_TABS[1], permissions: SOLAR_SALES_PERMISSIONS };

/** Home / Sales / [Solar] / Board / Chat: the fiber bar, with the deck in the center where Log sale sits. */
export const SOLAR_REP_TABS: RepTab[] = [
  REP_TABS[0],
  SOLAR_SALES_TAB,
  SOLAR_TAB,
  ...REP_TABS.filter((tab) => tab.href === '/portal/leaderboard' || tab.href === '/portal/chat'),
];

/**
 * The phone tab bar's destinations for this viewer (before the permission
 * gate). `solarOnly` is isSolarOnlyUser: a solar role and no fiber or platform
 * role. Fiber and dual (fiber + solar) reps keep the fiber set.
 */
export function repTabsFor(owner: boolean, solarOnly = false): RepTab[] {
  if (owner) return [...REP_TABS.filter((tab) => !tab.log), ADMIN_TAB];
  return solarOnly ? SOLAR_REP_TABS : REP_TABS;
}

/** The owner viewing as a rep (read only): Home, Sales and Board only. */
export function viewAsTabs(): RepTab[] {
  return REP_TABS.filter((tab) => !tab.log && tab.href !== '/portal/chat');
}

/**
 * Which primary destination the current path belongs to. Log sale wins over
 * Sales; every admin page is Admin. The Solar page (My leads and the deck's
 * way back) belongs to Sales; the deck itself to the Solar center tab.
 */
export function activeRepHref(pathname: string): string | null {
  if (pathname.startsWith(LOG_SALE_HREF)) return LOG_SALE_HREF;
  if (pathname === '/portal/dashboard') return '/portal/dashboard';
  if (pathname === '/portal/admin' || pathname.startsWith('/portal/admin/')) return ADMIN_TAB.href;
  if (pathname === SOLAR_DECK_HREF || pathname.startsWith(`${SOLAR_DECK_HREF}/`)) return SOLAR_DECK_HREF;
  if (pathname === SOLAR_HREF || pathname.startsWith(`${SOLAR_HREF}/`)) return '/portal/sales';
  const match = REP_TABS.find((tab) => tab.href !== '/portal/dashboard' && pathname.startsWith(tab.href));
  return match?.href ?? null;
}

/** Hrefs already on screen as tabs / top links, so the menu does not repeat them. */
export const REP_PRIMARY_HREFS = new Set(REP_TABS.map((tab) => tab.href));

/**
 * The same for a solar-only rep. The Solar page is no longer a tab (the deck
 * is), so it stays in the menu, as it is for a dual rep.
 */
export const SOLAR_REP_PRIMARY_HREFS = new Set(SOLAR_REP_TABS.map((tab) => tab.href));
