'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftToLine, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MobileBottomNav } from '@/components/portal/MobileBottomNav';
import {
  portalNavGroups,
  type PortalNavGroup,
  type PortalNavItem,
} from '@/components/portal/CommandPalette';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';

const EXACT_MATCH_ROUTES = new Set(['/portal/dashboard', '/portal/admin']);

function isItemActive(pathname: string, href: string) {
  return EXACT_MATCH_ROUTES.has(href) ? pathname === href : pathname.startsWith(href);
}

function NavLink({
  item,
  active,
  collapsed,
  badgeCount,
  onLinkClick,
}: {
  item: PortalNavItem;
  active: boolean;
  collapsed: boolean;
  badgeCount?: number;
  onLinkClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onLinkClick}
      className={`portal-rail-link${active ? ' is-active' : ''}`}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <span className="portal-rail-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="portal-rail-label">{item.label}</span>
      {!!badgeCount && (
        <span className="portal-rail-count" aria-label={`${badgeCount} pending signups`}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  );
}

function NavGroups({
  groups,
  pathname,
  collapsed,
  canAccess,
  getBadgeCount,
  onLinkClick,
}: {
  groups: PortalNavGroup[];
  pathname: string;
  collapsed: boolean;
  canAccess: (item: PortalNavItem) => boolean;
  getBadgeCount: (item: PortalNavItem) => number | undefined;
  onLinkClick?: () => void;
}) {
  return (
    <>
      {groups.map((group) => {
        const visibleItems = group.items.filter(canAccess);
        if (visibleItems.length === 0) return null;

        return (
          <section className="portal-rail-group" key={group.label ?? 'primary'}>
            {group.label && <p className="portal-rail-group-label">{group.label}</p>}
            <div className="portal-rail-group-items">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isItemActive(pathname, item.href)}
                  collapsed={collapsed}
                  badgeCount={getBadgeCount(item)}
                  onLinkClick={onLinkClick}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

export function PortalSidebar() {
  const pathname = usePathname();
  const { hasPermission, isRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('3c-rail-collapsed');
    // Restoring after mount keeps the first server/client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('3c-rail-collapsed', String(collapsed));
    } catch {
      // Ignore private-mode and storage quota failures.
    }
  }, [collapsed]);

  const canAccess = (item: PortalNavItem) => {
    if (item.roles && item.roles.length > 0 && !isRole(...item.roles)) return false;
    if (!item.permissions || item.permissions.length === 0) return true;
    return item.permissions.some((permission) => hasPermission(permission));
  };

  const visibleGroups = useMemo(
    () => portalNavGroups.filter((group) => !group.roles || isRole(...group.roles)),
    [isRole]
  );
  const showAdminSection = isRole('admin');
  const pendingSignupsCount = usePendingSignupsCount(showAdminSection);
  const getBadgeCount = (item: PortalNavItem) =>
    item.href === '/portal/admin/users' ? pendingSignupsCount : undefined;
  const railWidth = collapsed ? '66px' : '240px';

  return (
    <>
      <aside
        className={`portal-rail-sidebar${collapsed ? ' is-collapsed' : ''}`}
        aria-label="Primary navigation"
        style={{ '--portal-rail-width': railWidth } as React.CSSProperties}
      >
        <div className="portal-rail-top">
          <p className="portal-rail-kicker">Navigation / rail</p>
          <button
            type="button"
            className="portal-rail-collapse"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>

        <nav className="portal-rail-nav" aria-label="Portal sections">
          <NavGroups
            groups={visibleGroups}
            pathname={pathname}
            collapsed={collapsed}
            canAccess={canAccess}
            getBadgeCount={getBadgeCount}
          />
        </nav>

        <div className="portal-rail-footer">
          <Link href="/" className="portal-rail-footer-link" title={collapsed ? 'Back to Main Site' : undefined}>
            <ArrowLeftToLine aria-hidden="true" />
            <span>Back to Main Site</span>
          </Link>
        </div>
      </aside>

      {/* Existing page layouts keep their flex structure. This flow spacer offsets
          the fixed rail without requiring any page.tsx or layout edits. */}
      <div
        className={`portal-rail-spacer${collapsed ? ' is-collapsed' : ''}`}
        aria-hidden="true"
        style={{ '--portal-rail-width': railWidth } as React.CSSProperties}
      />

      <MobileBottomNav
        pendingSignupsCount={pendingSignupsCount}
        showAdminSection={showAdminSection}
      />
    </>
  );
}
