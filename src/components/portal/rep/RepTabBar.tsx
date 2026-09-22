'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNavAccess } from '@/components/portal/NavSheet';
import { BodyLayer } from './BodyLayer';
import { REP_TABS, activeRepHref } from './repNav';
import s from './rep.module.css';

/**
 * Phone bottom bar: Home / Sales / Log sale / Board / Chat, each gated by the
 * portal's canAccess. Portaled to <body> (see BodyLayer); hidden ≥1024px.
 */
export function RepTabBar({ chatUnread = false }: { chatUnread?: boolean }) {
  const pathname = usePathname();
  const { canAccess } = useNavAccess();
  const active = activeRepHref(pathname);
  const tabs = REP_TABS.filter(canAccess);

  return (
    <BodyLayer>
      <nav className={s.tabbar} aria-label="Primary" data-slot="rep-tab-bar">
        <ul className={s.tabs}>
          {tabs.map((tab) => {
            const current = tab.href === active;
            const Icon = tab.icon;
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
                      {tab.href === '/portal/chat' && chatUnread ? (
                        <i className={s.tabDot} aria-hidden="true" />
                      ) : null}
                    </span>
                  )}
                  {tab.short}
                  {tab.href === '/portal/chat' && chatUnread ? (
                    <span className={s.srOnly}>, unread messages</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </BodyLayer>
  );
}
