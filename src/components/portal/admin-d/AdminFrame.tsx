'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsUpDown, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { portalNavGroups, type PortalNavItem } from '@/components/portal/CommandPalette';
import { useNavAccess } from '@/components/portal/NavSheet';
import s from '@/components/portal/rep/rep.module.css';
import { AdminSheet } from './AdminSheet';
import { PEOPLE_HUB } from './adminHubs';
import f from './admin-frame.module.css';

const ADMIN_ROOT = '/portal/admin';

/** Ops Home is the admin root: only an exact match. Every other page owns its sub-paths. */
export function isAdminItemActive(pathname: string, href: string) {
  if (href === ADMIN_ROOT) return pathname === ADMIN_ROOT;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The admin pages from the portal's one nav config (portalNavGroups), under the same gates. */
const ADMIN_ITEMS = portalNavGroups.flatMap((group) =>
  group.items.filter((item) => item.href === ADMIN_ROOT || item.href.startsWith(`${ADMIN_ROOT}/`))
);

interface AdminNav {
  pathname: string;
  items: PortalNavItem[];
  current: PortalNavItem | null;
  pendingSignups: number;
}

function useAdminNav(): AdminNav {
  const pathname = usePathname();
  const { isRole } = useAuth();
  const { canAccess } = useNavAccess();
  const pendingSignups = usePendingSignupsCount(isRole('admin'));

  const items = useMemo(() => ADMIN_ITEMS.filter(canAccess), [canAccess]);
  const current = items.find((item) => isAdminItemActive(pathname, item.href)) ?? null;
  return { pathname, items, current, pendingSignups };
}

function countFor(href: string, pendingSignups: number) {
  return href === PEOPLE_HUB.href && pendingSignups > 0 ? (pendingSignups > 99 ? '99+' : String(pendingSignups)) : null;
}

function AdminRail({ nav }: { nav: AdminNav }) {
  return (
    <nav className={f.rail} aria-label="Admin pages">
      <ul className={f.railGroup}>
        {nav.items.map((item) => {
          const Icon = item.icon;
          const active = isAdminItemActive(nav.pathname, item.href);
          const count = countFor(item.href, nav.pendingSignups);
          return (
            <li key={item.href}>
              <Link href={item.href} className={f.railLink} aria-current={active ? 'page' : undefined}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {count ? (
                  <b className={f.railCount} aria-label={`${count} waiting`}>
                    {count}
                  </b>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AdminSwitcher({ nav }: { nav: AdminNav }) {
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(nav.pathname);
  // Navigating closes the sheet.
  if (openedOn !== nav.pathname) {
    setOpenedOn(nav.pathname);
    if (open) setOpen(false);
  }

  const CurrentIcon = nav.current?.icon ?? Shield;
  const usersCount = countFor(PEOPLE_HUB.href, nav.pendingSignups);

  return (
    <>
      <button
        type="button"
        className={f.switcher}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <CurrentIcon className={f.switcherIcon} aria-hidden="true" />
        <span className={f.switcherText}>
          <span className={f.switcherKicker}>Admin</span>
          <span className={f.switcherLabel}>{nav.current?.label ?? 'All admin pages'}</span>
        </span>
        {usersCount && nav.current?.href !== PEOPLE_HUB.href ? (
          <b className={f.switcherCount} aria-label={`${usersCount} signups waiting`}>
            {usersCount}
          </b>
        ) : null}
        <ChevronsUpDown size={18} className={f.switcherChevron} aria-hidden="true" />
      </button>

      {open ? (
        <AdminSheet title="Admin pages" onClose={() => setOpen(false)}>
          <nav className={`${f.sheetList} ${s.navGroup}`} aria-label="Admin pages">
            {nav.items.map((item) => {
              const Icon = item.icon;
              const active = isAdminItemActive(nav.pathname, item.href);
              const count = countFor(item.href, nav.pendingSignups);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={s.navItem}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  {count ? <b className={s.navCount}>{count}</b> : null}
                </Link>
              );
            })}
          </nav>
        </AdminSheet>
      ) : null}
    </>
  );
}

/**
 * Admin section chrome inside RepShell. The six admin pages: desktop gets a
 * sticky rail, phones a one-tap switcher. Someone who can open only one admin
 * page (a manager on People) gets neither.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const nav = useAdminNav();
  if (nav.items.length < 2) return <>{children}</>;

  return (
    <div className={f.frame}>
      <AdminRail nav={nav} />
      <div className={f.content}>
        <AdminSwitcher nav={nav} />
        {children}
      </div>
    </div>
  );
}
