'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeDollarSign,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
import { isOnboardingUser } from '@/lib/auth/onboardingAccess';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread } from '@/hooks/chat/useChatUnread';
import { type PortalNavItem } from '@/components/portal/CommandPalette';
import { NavSheet, isNavItemActive as isItemActive, useNavAccess } from '@/components/portal/NavSheet';

const mobileSlotItems: PortalNavItem[] = [
  { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
  { label: 'Sales', href: '/portal/sales', icon: BadgeDollarSign, permissions: ['sales:read'] },
  { label: 'Leaderboard', href: '/portal/leaderboard', icon: Trophy, permissions: ['leaderboard:read'] },
  { label: 'Team Chat', href: '/portal/chat', icon: MessageSquare, permissions: ['chat:read'] },
];

/**
 * The mobile shell: five-slot quick nav plus the full grouped navigation sheet.
 * The existing MobileMenuContext remains the source of truth for open state.
 */
export function MobileBottomNav({ navCounts }: { navCounts?: Record<string, number> }) {
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const { canAccess, sheetGroups } = useNavAccess();
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

  const visibleMobileSlotItems = isOnboardingUser(user)
    ? mobileSlotItems.filter((item) => canAccess(item))
    : mobileSlotItems;

  const visibleBottomHrefs = new Set(
    visibleMobileSlotItems.filter(canAccess).map((item) => item.href)
  );
  const visibleGroups = sheetGroups(visibleBottomHrefs);

  const handleSignOut = async () => {
    close();
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <>
      <nav className="portal-mobile-nav" aria-label="Quick navigation" data-slot="mobile-bottom-nav">
        <ul>
          {visibleMobileSlotItems.map((item) => {
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
        <NavSheet
          id="portal-mobile-sheet"
          titleId="portal-sheet-title"
          groups={visibleGroups}
          pathname={pathname}
          canAccess={canAccess}
          counts={navCounts}
          onClose={close}
          onSignOut={handleSignOut}
        />
      )}
    </>
  );
}
