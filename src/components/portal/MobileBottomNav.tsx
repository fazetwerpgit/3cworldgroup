'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftToLine,
  BadgeDollarSign,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread } from '@/hooks/chat/useChatUnread';
import {
  portalNavGroups,
  type PortalNavGroup,
  type PortalNavItem,
} from '@/components/portal/CommandPalette';

function isItemActive(pathname: string, href: string) {
  return href === '/portal/dashboard' ? pathname === href : pathname.startsWith(href);
}

const mobileSlotItems: PortalNavItem[] = [
  { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
  { label: 'Sales', href: '/portal/sales', icon: BadgeDollarSign, permissions: ['sales:read'] },
  { label: 'Team Chat', href: '/portal/chat', icon: MessageSquare, permissions: ['chat:read'] },
  { label: 'Leaderboard', href: '/portal/leaderboard', icon: Trophy, permissions: ['leaderboard:read'] },
];

function NavGroups({
  groups,
  pathname,
  canAccess,
  pendingSignupsCount,
  onLinkClick,
}: {
  groups: PortalNavGroup[];
  pathname: string;
  canAccess: (item: PortalNavItem) => boolean;
  pendingSignupsCount: number;
  onLinkClick: () => void;
}) {
  return (
    <nav className="portal-sheet-nav" aria-label="Full portal navigation">
      {groups.map((group) => {
        const visibleItems = group.items.filter(canAccess);
        if (!visibleItems.length) return null;

        return (
          <section className="portal-sheet-group" key={group.label ?? 'primary'}>
            {group.label && <p className="portal-sheet-group-label">{group.label}</p>}
            <div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const badgeCount = item.href === '/portal/admin/users' ? pendingSignupsCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onLinkClick}
                    className={`portal-sheet-link${isItemActive(pathname, item.href) ? ' is-active' : ''}`}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {!!badgeCount && <b>{badgeCount > 99 ? '99+' : badgeCount}</b>}
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

/**
 * The mobile shell: five-slot quick nav plus the full grouped navigation sheet.
 * The existing MobileMenuContext remains the source of truth for open state.
 */
export function MobileBottomNav({
  pendingSignupsCount = 0,
  showAdminSection = false,
}: {
  pendingSignupsCount?: number;
  showAdminSection?: boolean;
}) {
  const pathname = usePathname();
  const { hasPermission, isRole, user } = useAuth();
  const { isOpen, toggle, close } = useMobileMenu();
  const { channels } = useChatChannels();
  const { anyUnread } = useChatUnread(channels, user?.uid);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const previousOverflowRef = useRef('');

  useEffect(() => {
    document.body.dataset.portalBottomNav = 'on';
    return () => {
      delete document.body.dataset.portalBottomNav;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) previousOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else if (wasOpenRef.current) {
      document.body.style.overflow = previousOverflowRef.current;
      requestAnimationFrame(() => moreButtonRef.current?.focus());
    }
    wasOpenRef.current = isOpen;

    return () => {
      if (isOpen) document.body.style.overflow = previousOverflowRef.current;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, isOpen]);

  const canAccess = (item: PortalNavItem) => {
    if (item.roles && item.roles.length > 0 && !isRole(...item.roles)) return false;
    if (!item.permissions || item.permissions.length === 0) return true;
    return item.permissions.some((permission) => hasPermission(permission));
  };

  const visibleGroups = portalNavGroups.filter(
    (group) => (!group.roles || isRole(...group.roles)) && group.items.some(canAccess)
  );

  return (
    <>
      <nav className="portal-mobile-nav" aria-label="Quick navigation" data-slot="mobile-bottom-nav">
        <ul>
          {mobileSlotItems.map((item) => {
            if (!canAccess(item)) {
              return <li key={item.href} aria-hidden="true" />;
            }

            const Icon = item.icon;
            const active = isItemActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} className={active ? 'is-active' : undefined}>
                  <span className="portal-mobile-icon-wrap">
                    <Icon aria-hidden="true" />
                    {item.label === 'Team Chat' && anyUnread && (
                      <i aria-label="Unread messages" />
                    )}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={moreButtonRef}
              type="button"
              onClick={toggle}
              className={isOpen ? 'is-active' : undefined}
              aria-expanded={isOpen}
              aria-controls="portal-mobile-sheet"
            >
              <Menu aria-hidden="true" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      {isOpen && (
        <div
          className="portal-sheet-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            id="portal-mobile-sheet"
            className="portal-nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="portal-sheet-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="portal-sheet-handle" aria-hidden="true" />
            <div className="portal-sheet-header">
              <div>
                <p>The Rail / full navigation</p>
                <h2 id="portal-sheet-title">More of the portal</h2>
              </div>
              <button type="button" onClick={close} aria-label="Close full navigation">
                <X aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
            <NavGroups
              groups={visibleGroups}
              pathname={pathname}
              canAccess={canAccess}
              pendingSignupsCount={showAdminSection ? pendingSignupsCount : 0}
              onLinkClick={close}
            />
            <Link href="/" className="portal-sheet-footer" onClick={close}>
              <ArrowLeftToLine aria-hidden="true" />
              Back to Main Site
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
