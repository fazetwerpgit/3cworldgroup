'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeftToLine, LogOut, Settings, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isOnboardingAllowedPage, isOnboardingUser } from '@/lib/auth/onboardingAccess';
import {
  portalNavGroups,
  type PortalNavGroup,
  type PortalNavItem,
} from '@/components/portal/CommandPalette';

// The full grouped portal navigation, shared by the old chrome's mobile "More"
// sheet (MobileBottomNav) and the direction D shell's menu button. Both render
// the same items behind the same gates; only the class names differ.

/** Dashboard matches only itself; every other page owns its sub-paths. */
const EXACT_MATCH_HREFS = new Set(['/portal/dashboard']);

export function isNavItemActive(pathname: string, href: string) {
  if (EXACT_MATCH_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The portal's one nav gate (same as the sidebar and palette): role first, then permissions. */
export function useNavAccess() {
  const { hasPermission, isRole, user } = useAuth();

  const canAccess = useCallback(
    (item: PortalNavItem) => {
      if (item.openTo && !item.openTo(user?.role, user?.uid)) return false;
      if (item.onboardingOnly && !isOnboardingUser(user)) return false;
      if (item.roles && item.roles.length > 0 && !isRole(...item.roles)) return false;
      if (isOnboardingUser(user) && !isOnboardingAllowedPage(item.href)) return false;
      if (!item.permissions || item.permissions.length === 0) return true;
      return item.permissions.some((permission) => hasPermission(permission));
    },
    [hasPermission, isRole, user]
  );

  /** portalNavGroups the caller can see, minus hrefs already on screen (tabs, top links) and Settings. */
  const sheetGroups = useCallback(
    (excludeHrefs: Set<string>): PortalNavGroup[] =>
      portalNavGroups
        .filter((group) => !group.roles || isRole(...group.roles))
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => item.href !== '/portal/settings' && !excludeHrefs.has(item.href)
          ),
        }))
        .filter((group) => group.items.some(canAccess)),
    [canAccess, isRole]
  );

  return { canAccess, sheetGroups };
}

export interface NavSheetClasses {
  backdrop?: string;
  sheet?: string;
  handle?: string;
  header?: string;
  title?: string;
  close?: string;
  closeLabel?: string;
  body?: string;
  nav?: string;
  group?: string;
  groupLabel?: string;
  link?: string;
  /** Appended to `link` on the current page. */
  linkActive?: string;
  count?: string;
  actions?: string;
  action?: string;
}

/** The old chrome's global class names (globals.css .portal-nav-sheet …). */
export const legacyNavSheetClasses: NavSheetClasses = {
  backdrop: 'portal-sheet-backdrop',
  sheet: 'portal-nav-sheet',
  handle: 'portal-sheet-handle',
  header: 'portal-sheet-header',
  nav: 'portal-sheet-nav',
  group: 'portal-sheet-group',
  groupLabel: 'portal-sheet-group-label',
  link: 'portal-sheet-link',
  linkActive: 'is-active',
  actions: 'portal-sheet-actions',
};

export function NavGroupsList({
  groups,
  pathname,
  canAccess,
  counts = {},
  onLinkClick,
  classes = legacyNavSheetClasses,
}: {
  groups: PortalNavGroup[];
  pathname: string;
  canAccess: (item: PortalNavItem) => boolean;
  /** Open items per page href (People signups, Onboarding and Requests queues). */
  counts?: Record<string, number>;
  onLinkClick: () => void;
  classes?: NavSheetClasses;
}) {
  return (
    <nav className={classes.nav} aria-label="Full portal navigation">
      {groups.map((group) => {
        const visibleItems = group.items.filter(canAccess);
        if (!visibleItems.length) return null;

        return (
          <section className={classes.group} key={group.label ?? 'primary'}>
            {group.label && <p className={classes.groupLabel}>{group.label}</p>}
            <div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isNavItemActive(pathname, item.href);
                const badgeCount = counts[item.href] ?? 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onLinkClick}
                    className={`${classes.link ?? ''}${active && classes.linkActive ? ` ${classes.linkActive}` : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {!!badgeCount && (
                      <b className={classes.count}>{badgeCount > 99 ? '99+' : badgeCount}</b>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

/** Back to site, Settings, Sign out — always last. */
export function NavSheetActions({
  onClose,
  onSignOut,
  classes = legacyNavSheetClasses,
}: {
  onClose: () => void;
  onSignOut: () => void;
  classes?: NavSheetClasses;
}) {
  return (
    <div className={classes.actions}>
      <Link href="/" onClick={onClose} className={classes.action}>
        <ArrowLeftToLine aria-hidden="true" />
        Back to main site
      </Link>
      <Link href="/portal/settings" onClick={onClose} className={classes.action}>
        <Settings aria-hidden="true" />
        Settings
      </Link>
      <button type="button" onClick={onSignOut} className={classes.action}>
        <LogOut aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

/**
 * The full grouped navigation sheet. Rendering it in place or portaling it to
 * <body> is the caller's call: the D shell portals it (iOS fixed-in-scroller
 * bug), the old chrome keeps it where it always was.
 */
export function NavSheet({
  id,
  titleId,
  groups,
  pathname,
  canAccess,
  counts,
  onClose,
  onSignOut,
  classes = legacyNavSheetClasses,
}: {
  id: string;
  titleId: string;
  groups: PortalNavGroup[];
  pathname: string;
  canAccess: (item: PortalNavItem) => boolean;
  counts?: Record<string, number>;
  onClose: () => void;
  onSignOut: () => void;
  classes?: NavSheetClasses;
}) {
  const content = (
    <>
      <NavGroupsList
        groups={groups}
        pathname={pathname}
        canAccess={canAccess}
        counts={counts}
        onLinkClick={onClose}
        classes={classes}
      />
      <NavSheetActions onClose={onClose} onSignOut={onSignOut} classes={classes} />
    </>
  );

  return (
    <div
      className={classes.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        id={id}
        className={classes.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={classes.handle} aria-hidden="true" />
        <div className={classes.header}>
          <h2 id={titleId} className={classes.title}>Menu</h2>
          <button type="button" onClick={onClose} aria-label="Close menu" className={classes.close}>
            <X aria-hidden="true" />
            <span className={classes.closeLabel}>Close</span>
          </button>
        </div>
        {classes.body ? <div className={classes.body}>{content}</div> : content}
      </section>
    </div>
  );
}
