'use client';

import { useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAs } from '@/contexts/ViewAsContext';
import { useNavAccess } from '@/components/portal/NavSheet';
import { isDualRoleUser, isOwner, isSolarOnlyUser } from '@/types';
import { useIsNativeApp } from '@/lib/app/isNativeApp';
import { nativeHaptic } from '@/lib/app/bridge';
import { scrollPageToTop } from '@/lib/app/scrollToTop';
import { BodyLayer } from './BodyLayer';
import { LogChooserSheet } from './LogChooserSheet';
import { markTabNavigation } from './tabNav';
import { usePrefetchTabOnTouch } from './useTabPrefetch';
import { activeRepHref, LOG_SALE_HREF, repTabsFor, viewAsTabs } from './repNav';
import s from './rep.module.css';
import t from './rep-tabbar.module.css';

/**
 * Phone bottom bar: Home / Sales / Log sale / Board / Chat, each gated by the
 * portal's canAccess. Owners do not sell, so theirs is Home / Sales / Board /
 * Chat / Admin, the Admin tab carrying the open-items count. A solar-only rep
 * gets Home / Sales / Solar / Board / Chat, the center Solar opening the deck.
 * A dual (fiber + solar) rep's center + opens a chooser (LogChooserSheet): Log
 * fiber sale, or Open solar deck. Portaled to
 * <body> (see BodyLayer); hidden ≥1024px.
 *
 * Inside the 3C iOS app it behaves like a UITabBar: a tap gives a selection
 * haptic and replaces the history entry (so the edge swipe never steps back
 * through tabs), a tab opens where it was left, and tapping the tab you are on
 * scrolls it to the top. On the web the links are plain links.
 */
export function RepTabBar({
  chatUnread = false,
  navCounts = {},
}: {
  chatUnread?: boolean;
  /** Open items per admin page href (the same figures as the menu badges). */
  navCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { canAccess } = useNavAccess();
  const active = activeRepHref(pathname);
  // Viewing as a rep (read only): just the rep screens the owner can see.
  const { viewing } = useViewAs();
  const tabs = (viewing ? viewAsTabs() : repTabsFor(isOwner(user?.role ?? undefined), isSolarOnlyUser(user))).filter(canAccess);
  const waiting = Object.values(navCounts).reduce((sum, n) => sum + n, 0);
  // A finger on a tab starts its data read before the tap lands.
  const prefetchTab = usePrefetchTabOnTouch();
  const inApp = useIsNativeApp();
  // A dual rep's + asks fiber or solar first; everyone else's goes straight to its page.
  const chooser = !viewing && !isOwner(user?.role ?? undefined) && isDualRoleUser(user);
  const [choosing, setChoosing] = useState(false);
  const chooserBtn = useRef<HTMLButtonElement | null>(null);
  const closeChooser = (navigated?: boolean) => {
    setChoosing(false);
    // Back to the + it came from, unless a choice navigated (focus moves on its own).
    if (!navigated) chooserBtn.current?.focus({ preventScroll: true });
  };

  const onTabClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!inApp || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    nativeHaptic('selection');
    if (pathname === href) {
      // Already on this tab's own page: back to its top, as iOS does.
      event.preventDefault();
      scrollPageToTop();
      return;
    }
    markTabNavigation(href);
  };

  return (
    <BodyLayer>
      <nav className={s.tabbar} aria-label="Primary" data-slot="rep-tab-bar">
        <ul className={s.tabs}>
          {tabs.map((tab) => {
            const current = tab.href === active;
            const Icon = tab.icon;
            const unread = tab.href === '/portal/chat' && chatUnread;
            const count = tab.waiting ? waiting : 0;
            if (tab.log && chooser) {
              return (
                <li key={tab.href}>
                  <button
                    ref={chooserBtn}
                    type="button"
                    className={`${s.tab} ${t.tabBtn}`}
                    aria-current={current ? 'page' : undefined}
                    aria-haspopup="dialog"
                    aria-expanded={choosing}
                    onClick={() => {
                      if (inApp) nativeHaptic('selection');
                      setChoosing(true);
                    }}
                  >
                    <span className={s.tabLog}>
                      <Icon size={20} strokeWidth={2.5} aria-hidden="true" />
                    </span>
                    {tab.short}
                  </button>
                </li>
              );
            }
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={s.tab}
                  aria-current={current ? 'page' : undefined}
                  replace={inApp}
                  scroll={inApp ? false : undefined}
                  onClick={(event) => onTabClick(event, tab.href)}
                  onTouchStart={current ? undefined : () => prefetchTab(tab.href)}
                  onPointerDown={current ? undefined : () => prefetchTab(tab.href)}
                >
                  {tab.emphasis ? (
                    <span className={s.tabLog}>
                      <Icon size={20} strokeWidth={2.5} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className={s.tabIcon}>
                      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                      {unread ? <i className={s.tabDot} aria-hidden="true" /> : null}
                      {count > 0 ? (
                        <b className={t.count} aria-hidden="true">
                          {count > 99 ? '99+' : count}
                        </b>
                      ) : null}
                    </span>
                  )}
                  {tab.short}
                  {unread ? <span className={s.srOnly}>, unread messages</span> : null}
                  {count > 0 ? <span className={s.srOnly}>{`, ${count} waiting`}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Its own BodyLayer portals it straight to <body>, beside the bar. */}
      {choosing ? (
        <LogChooserSheet onClose={closeChooser} inApp={inApp} onFiberClick={(event) => onTabClick(event, LOG_SALE_HREF)} />
      ) : null}
    </BodyLayer>
  );
}
