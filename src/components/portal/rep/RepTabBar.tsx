'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNavAccess } from '@/components/portal/NavSheet';
import { isOwner } from '@/types';
import { BodyLayer } from './BodyLayer';
import { activeRepHref, repTabsFor } from './repNav';
import s from './rep.module.css';
import t from './rep-tabbar.module.css';

/**
 * Phone bottom bar: Home / Sales / Log sale / Board / Chat, each gated by the
 * portal's canAccess. Owners do not sell, so theirs is Home / Sales / Board /
 * Chat / Admin, the Admin tab carrying the open-items count. Portaled to
 * <body> (see BodyLayer); hidden ≥1024px.
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
  const tabs = repTabsFor(isOwner(user?.role ?? undefined)).filter(canAccess);
  const waiting = Object.values(navCounts).reduce((sum, n) => sum + n, 0);

  return (
    <BodyLayer>
      <nav className={s.tabbar} aria-label="Primary" data-slot="rep-tab-bar">
        <ul className={s.tabs}>
          {tabs.map((tab) => {
            const current = tab.href === active;
            const Icon = tab.icon;
            const unread = tab.href === '/portal/chat' && chatUnread;
            const count = tab.waiting ? waiting : 0;
            return (
              <li key={tab.href}>
                <Link href={tab.href} className={s.tab} aria-current={current ? 'page' : undefined}>
                  {tab.log ? (
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
    </BodyLayer>
  );
}
