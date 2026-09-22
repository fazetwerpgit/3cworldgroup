'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Bug, ChevronDown, LogOut, Menu, Plus, Settings, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { isOnboardingUser } from '@/lib/auth/onboardingAccess';
import { NavGroupsList, NavSheet, useNavAccess, type NavSheetClasses } from '@/components/portal/NavSheet';
import { BodyLayer } from './BodyLayer';
import { LOG_SALE_HREF, REP_PRIMARY_HREFS, REP_TABS, activeRepHref } from './repNav';
import s from './rep.module.css';

type Panel = 'menu' | 'more' | 'account' | 'notes' | null;

export const repSheetClasses: NavSheetClasses = {
  backdrop: s.backdrop,
  sheet: s.sheet,
  handle: s.sheetHandle,
  header: s.sheetHead,
  title: s.sheetTitle,
  close: s.iconBtn,
  closeLabel: s.srOnly,
  body: s.sheetBody,
  group: s.navGroup,
  groupLabel: s.navGroupLabel,
  link: s.navItem,
  count: s.navCount,
  actions: s.navActions,
  action: s.navItem,
};

function initials(name?: string | null, email?: string | null) {
  const value = name?.trim() || email?.split('@')[0] || 'User';
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : value.slice(0, 2).toUpperCase();
}

function timeAgo(date: Date | string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * D top bar. Phone: brand, bell, menu (the full grouped nav sheet). Desktop:
 * brand, Dashboard / Sales / Leaderboard / Chat, More, bell, avatar, Log sale.
 * No role line (it would expose IBO / tier / manager titles). Every panel it
 * opens is portaled to <body>.
 */
export function RepTopBar({
  chatUnread = false,
  pendingSignupsCount = 0,
}: {
  chatUnread?: boolean;
  pendingSignupsCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { canAccess, sheetGroups } = useNavAccess();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [panel, setPanel] = useState<Panel>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setPanel(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const toggle = (next: Exclude<Panel, null>) => (event: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget;
    setPanel((current) => (current === next ? null : next));
  };

  // Any navigation closes whatever was open.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    if (panel) setPanel(null);
  }

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanel(null);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel]);

  const handleSignOut = async () => {
    setPanel(null);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const active = activeRepHref(pathname);
  const deskLinks = REP_TABS.filter((tab) => !tab.log && canAccess(tab));
  const canLog = REP_TABS.some((tab) => tab.log && canAccess(tab));
  const groups = sheetGroups(REP_PRIMARY_HREFS);
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'You';
  const brandHref = isOnboardingUser(user) ? '/portal/onboarding' : '/portal/dashboard';
  const adminBadge = pendingSignupsCount;

  return (
    <>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <Link href={brandHref} className={s.brand} aria-label="3C World Group home">
            <Image src="/logo.webp" alt="" width={550} height={516} sizes="34px" className={s.brandMark} priority />
            <span className={s.brandWord}>3C World Group</span>
          </Link>

          <ul className={s.deskNav}>
            {deskLinks.map((tab) => (
              <li key={tab.href}>
                <Link href={tab.href} className={s.navLink} aria-current={tab.href === active ? 'page' : undefined}>
                  {tab.label}
                  {tab.href === '/portal/chat' && chatUnread ? (
                    <>
                      <span className={s.navDot} aria-hidden="true" />
                      <span className={s.srOnly}>, unread messages</span>
                    </>
                  ) : null}
                </Link>
              </li>
            ))}
            {groups.length > 0 ? (
              <li>
                <button
                  type="button"
                  className={s.navLink}
                  aria-expanded={panel === 'more'}
                  aria-haspopup="true"
                  onClick={toggle('more')}
                >
                  More
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              </li>
            ) : null}
          </ul>

          <button
            type="button"
            className={s.iconBtn}
            aria-expanded={panel === 'notes'}
            aria-haspopup="true"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            onClick={toggle('notes')}
          >
            <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
            {unreadCount > 0 ? <span className={s.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
          </button>

          <button
            type="button"
            className={`${s.iconBtn} ${s.phoneOnly}`}
            aria-expanded={panel === 'menu'}
            aria-controls="rep-nav-sheet"
            aria-label={adminBadge > 0 ? `Menu, ${adminBadge} signups waiting` : 'Menu'}
            onClick={toggle('menu')}
          >
            <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
            {adminBadge > 0 ? <i className={s.dot} aria-hidden="true" /> : null}
          </button>

          <button
            type="button"
            className={s.avatarBtn}
            aria-expanded={panel === 'account'}
            aria-haspopup="true"
            aria-label={`${displayName}, account`}
            onClick={toggle('account')}
          >
            <span className={s.playerName}>{displayName}</span>
            <span className={s.avatar} aria-hidden="true">
              {initials(user?.displayName, user?.email)}
            </span>
          </button>

          {canLog && active !== LOG_SALE_HREF ? (
            <Link href={LOG_SALE_HREF} className={`${s.btnPrimary} ${s.navCta}`}>
              <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
              Log sale
            </Link>
          ) : null}
        </div>
      </header>

      {panel === 'menu' ? (
        <BodyLayer>
          <NavSheet
            id="rep-nav-sheet"
            titleId="rep-nav-sheet-title"
            groups={groups}
            pathname={pathname}
            canAccess={canAccess}
            pendingSignupsCount={pendingSignupsCount}
            onClose={close}
            onSignOut={handleSignOut}
            classes={repSheetClasses}
          />
        </BodyLayer>
      ) : null}

      {panel === 'more' ? (
        <BodyLayer>
          <button type="button" className={s.dropClear} aria-label="Close menu" tabIndex={-1} onClick={close} />
          <div className={s.drop} role="dialog" aria-label="More pages">
            <NavGroupsList
              groups={groups}
              pathname={pathname}
              canAccess={canAccess}
              pendingSignupsCount={pendingSignupsCount}
              onLinkClick={() => setPanel(null)}
              classes={repSheetClasses}
            />
          </div>
        </BodyLayer>
      ) : null}

      {panel === 'account' ? (
        <BodyLayer>
          <button type="button" className={s.dropClear} aria-label="Close account menu" tabIndex={-1} onClick={close} />
          <div className={s.drop} role="dialog" aria-label="Account">
            <p className={s.whoami}>
              {displayName}
              <span>{user?.email}</span>
            </p>
            <div className={s.navGroup}>
              <Link href="/portal/settings" className={s.navItem} onClick={() => setPanel(null)}>
                <Settings aria-hidden="true" />
                Settings
              </Link>
              <Link href="/portal/settings#report-bug" className={s.navItem} onClick={() => setPanel(null)}>
                <Bug aria-hidden="true" />
                Report a bug
              </Link>
              <button type="button" className={s.navItem} onClick={handleSignOut}>
                <LogOut aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </BodyLayer>
      ) : null}

      {panel === 'notes' ? (
        <BodyLayer>
          <button type="button" className={s.dropClear} aria-label="Close notifications" tabIndex={-1} onClick={close} />
          <div className={s.drop} role="dialog" aria-labelledby="rep-notes-title">
            <div className={s.noteHead}>
              <h2 id="rep-notes-title" className={s.kicker}>
                Notifications
              </h2>
              {unreadCount > 0 ? (
                <button type="button" className={s.textBtn} onClick={markAllAsRead}>
                  Mark all read
                </button>
              ) : (
                <button type="button" className={s.iconBtn} aria-label="Close notifications" onClick={close}>
                  <X size={20} aria-hidden="true" />
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className={s.noteEmpty}>You&apos;re all caught up.</p>
            ) : (
              notifications.slice(0, 10).map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className={`${s.note} ${note.read ? '' : s.noteUnread}`}
                  onClick={() => {
                    markAsRead([note.id]);
                    if (note.link) {
                      setPanel(null);
                      router.push(note.link);
                    }
                  }}
                >
                  <span className={s.noteTitle}>{note.title}</span>
                  <span className={s.noteTime}>{timeAgo(note.createdAt)}</span>
                  <span className={s.noteMsg}>{note.message}</span>
                </button>
              ))
            )}
          </div>
        </BodyLayer>
      ) : null}
    </>
  );
}
