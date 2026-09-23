'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsUpDown, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { portalNavGroups, type PortalNavGroup, type PortalNavItem } from '@/components/portal/CommandPalette';
import { useNavAccess } from '@/components/portal/NavSheet';
import s from '@/components/portal/rep/rep.module.css';
import { AdminSheet } from './AdminSheet';
import f from './admin-frame.module.css';

const ADMIN_ROOT = '/portal/admin';
const USERS_HREF = '/portal/admin/users';

/** Ops Home is the admin root: only an exact match. Every other page owns its sub-paths. */
export function isAdminItemActive(pathname: string, href: string) {
  if (href === ADMIN_ROOT) return pathname === ADMIN_ROOT;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin pages from the portal's one nav config (portalNavGroups), in the
 * same groups and under the same gates, with Ops Home lifted to the top as the
 * section's home.
 */
function adminSections(): PortalNavGroup[] {
  const home: PortalNavItem[] = [];
  const groups: PortalNavGroup[] = [];
  for (const group of portalNavGroups) {
    const items: PortalNavItem[] = [];
    for (const item of group.items) {
      if (!item.href.startsWith(ADMIN_ROOT)) continue;
      if (item.href === ADMIN_ROOT) home.push(item);
      else items.push(item);
    }
    if (items.length) groups.push({ ...group, items });
  }
  return home.length ? [{ items: home }, ...groups] : groups;
}

function useAdminNav() {
  const pathname = usePathname();
  const { isRole } = useAuth();
  const { canAccess } = useNavAccess();
  const pendingSignups = usePendingSignupsCount(isRole('admin'));

  const groups = useMemo(
    () =>
      adminSections()
        .filter((group) => !group.roles || isRole(...group.roles))
        .map((group) => ({ ...group, items: group.items.filter(canAccess) }))
        .filter((group) => group.items.length > 0),
    [canAccess, isRole]
  );
  const items = groups.flatMap((group) => group.items);
  const current = items.find((item) => isAdminItemActive(pathname, item.href)) ?? null;
  return { pathname, groups, items, current, pendingSignups };
}

function countFor(href: string, pendingSignups: number) {
  return href === USERS_HREF && pendingSignups > 0 ? (pendingSignups > 99 ? '99+' : String(pendingSignups)) : null;
}

function AdminRail({ nav }: { nav: ReturnType<typeof useAdminNav> }) {
  return (
    <nav className={f.rail} aria-label="Admin pages">
      {nav.groups.map((group) => (
        <div key={group.label ?? 'home'} className={f.railSection}>
          {group.label ? <p className={f.railLabel}>{group.label}</p> : null}
          <ul className={f.railGroup}>
            {group.items.map((item) => {
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
        </div>
      ))}
    </nav>
  );
}

function AdminSwitcher({ nav }: { nav: ReturnType<typeof useAdminNav> }) {
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(nav.pathname);
  // Navigating closes the sheet.
  if (openedOn !== nav.pathname) {
    setOpenedOn(nav.pathname);
    if (open) setOpen(false);
  }

  const CurrentIcon = nav.current?.icon ?? Shield;
  const usersCount = countFor(USERS_HREF, nav.pendingSignups);

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
        {usersCount && nav.current?.href !== USERS_HREF ? (
          <b className={f.switcherCount} aria-label={`${usersCount} signups waiting`}>
            {usersCount}
          </b>
        ) : null}
        <ChevronsUpDown size={18} className={f.switcherChevron} aria-hidden="true" />
      </button>

      {open ? (
        <AdminSheet title="Admin pages" onClose={() => setOpen(false)}>
          <nav className={f.sheetList} aria-label="Admin pages">
            {nav.groups.map((group) => (
              <section key={group.label ?? 'home'} className={s.navGroup}>
                {group.label ? <p className={s.navGroupLabel}>{group.label}</p> : null}
                {group.items.map((item) => {
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
              </section>
            ))}
          </nav>
        </AdminSheet>
      ) : null}
    </>
  );
}

/**
 * Admin section chrome inside RepShell. Owners hop between a dozen admin pages,
 * so the top bar's More menu is not enough: desktop gets a sticky rail, phones
 * a one-tap switcher. Someone who can open only one admin page (a manager on
 * Recruiting) gets neither.
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
