import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavSheet, isNavItemActive, useNavAccess } from '@/components/portal/NavSheet';
import { RepTabBar } from './RepTabBar';
import { RepTopBar, repSheetClasses } from './RepTopBar';
import { REP_PRIMARY_HREFS, activeRepHref } from './repNav';

type TestUser = { status?: string; fieldRole?: string; role?: string; uid?: string; displayName?: string; email?: string };

const state = vi.hoisted(() => ({
  allowed: new Set<string>(),
  auth: {
    user: null as TestUser | null,
    hasPermission: (permission: string) => state.allowed.has(permission),
    isRole: (...roles: string[]) =>
      roles.some((role) => role === state.auth.user?.role || role === state.auth.user?.fieldRole),
    signOut: vi.fn(async () => {}),
  },
  pathname: '/portal/dashboard',
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 2, markAsRead: vi.fn(), markAllAsRead: vi.fn() }),
}));
// Portals need a DOM; render the layer inline so the markup can be asserted.
vi.mock('./BodyLayer', () => ({
  BodyLayer: ({ children }: { children: React.ReactNode }) => <div data-layer="body">{children}</div>,
  useIsClient: () => true,
}));

const REP_PERMISSIONS = ['sales:read', 'sales:write', 'leaderboard:read', 'chat:read'];

function setUser(user: TestUser, permissions: string[] = REP_PERMISSIONS) {
  state.auth.user = user;
  state.allowed = new Set(permissions);
}

function RepMenu() {
  const { canAccess, sheetGroups } = useNavAccess();
  return (
    <NavSheet
      id="rep-nav-sheet"
      titleId="rep-nav-sheet-title"
      groups={sheetGroups(REP_PRIMARY_HREFS)}
      pathname={state.pathname}
      canAccess={canAccess}
      onClose={vi.fn()}
      onSignOut={vi.fn()}
      classes={repSheetClasses}
    />
  );
}

describe('RepTabBar', () => {
  beforeEach(() => {
    state.pathname = '/portal/dashboard';
    setUser({ status: 'active', fieldRole: 'entry_rep', uid: 'rep-1' });
  });

  it('shows Home / Sales / Log sale / Board / Chat in that order and no Pay tab', () => {
    const html = renderToStaticMarkup(<RepTabBar />);
    const labels = ['Home', 'Sales', 'Log sale', 'Board', 'Chat'].map((label) => html.indexOf(`${label}</a>`));
    expect(labels.every((index) => index > 0)).toBe(true);
    expect([...labels].sort((a, b) => a - b)).toEqual(labels);
    expect(html).not.toContain('Pay');
  });

  it('marks the current tab and carries the chat unread dot only when unread', () => {
    const quiet = renderToStaticMarkup(<RepTabBar />);
    expect(quiet).toMatch(/aria-current="page" href="\/portal\/dashboard"/);
    expect(quiet).not.toContain('unread messages');
    expect(renderToStaticMarkup(<RepTabBar chatUnread />)).toContain('unread messages');
  });

  it('drops tabs the user cannot open', () => {
    setUser({ status: 'active', fieldRole: 'entry_rep' }, ['sales:read']);
    const html = renderToStaticMarkup(<RepTabBar />);
    expect(html).toContain('Home</a>');
    expect(html).toContain('Sales</a>');
    expect(html).not.toContain('Log sale');
    expect(html).not.toContain('Board');
    expect(html).not.toContain('Chat');
  });
});

describe('RepTopBar', () => {
  beforeEach(() => {
    state.pathname = '/portal/dashboard';
  });

  it('never prints the role / title line', () => {
    setUser({ status: 'active', fieldRole: 'l1_manager', uid: 'm-1', displayName: 'Devon Price', email: 'd@x.com' });
    const html = renderToStaticMarkup(<RepTopBar />);
    expect(html).toContain('Devon Price');
    expect(html).not.toMatch(/Manager|IBO|Tier|Account Executive/i);
  });

  it('keeps the bell (with unread count) and the menu button', () => {
    setUser({ status: 'active', fieldRole: 'entry_rep', uid: 'rep-1' });
    const html = renderToStaticMarkup(<RepTopBar />);
    expect(html).toContain('aria-label="Notifications, 2 unread"');
    expect(html).toContain('aria-controls="rep-nav-sheet"');
    expect(html).toContain('href="/portal/sales/new"');
  });

  it('sends a task page back to its parent, or the dashboard by default', () => {
    setUser({ status: 'active', fieldRole: 'entry_rep', uid: 'rep-1' });
    const backLink = (html: string) => html.match(/<a\b[^>]*aria-label="Back to [^"]*"[^>]*>/)?.[0] ?? '';
    expect(backLink(renderToStaticMarkup(<RepTopBar />))).toBe('');
    const plain = backLink(renderToStaticMarkup(<RepTopBar task="Log a sale" />));
    expect(plain).toContain('href="/portal/dashboard"');
    expect(plain).toContain('aria-label="Back to dashboard"');
    const form = backLink(renderToStaticMarkup(<RepTopBar task="Fiber report" back={{ href: '/portal/forms', label: 'forms' }} />));
    expect(form).toContain('href="/portal/forms"');
    expect(form).toContain('aria-label="Back to forms"');
  });

  it('points a pending hire at onboarding', () => {
    setUser({ status: 'pending', fieldRole: 'entry_level_rep', uid: 'hire-1' });
    const brand = renderToStaticMarkup(<RepTopBar />).match(/<a\b[^>]*3C World Group home[^>]*>/)?.[0] ?? '';
    expect(brand).toContain('href="/portal/onboarding"');
  });
});

describe('rep menu sheet', () => {
  beforeEach(() => {
    state.pathname = '/portal/dashboard';
    setUser({ status: 'active', fieldRole: 'entry_rep', uid: 'rep-1' }, [...REP_PERMISSIONS, 'training:read']);
  });

  it('lists the pages that are not tabs, then account actions last', () => {
    const html = renderToStaticMarkup(<RepMenu />);
    expect(html).toContain('>Calls<');
    expect(html).toContain('>University<');
    expect(html).not.toContain('>Dashboard<');
    expect(html).not.toContain('>Team Chat<');
    expect(html.indexOf('>Settings')).toBeGreaterThan(html.indexOf('>University<'));
    expect(html.indexOf('>Sign out')).toBeGreaterThan(html.indexOf('>Settings'));
  });

  it('keeps admin-only groups away from reps and shows them to admins', () => {
    expect(renderToStaticMarkup(<RepMenu />)).not.toContain('User Management');
    setUser({ status: 'active', role: 'admin', uid: 'a-1' }, [...REP_PERMISSIONS, 'users:read']);
    expect(renderToStaticMarkup(<RepMenu />)).toContain('User Management');
  });
});

describe('isNavItemActive', () => {
  it('matches Dashboard and Ops Home only on their own page', () => {
    expect(isNavItemActive('/portal/admin', '/portal/admin')).toBe(true);
    expect(isNavItemActive('/portal/admin/users', '/portal/admin')).toBe(false);
    expect(isNavItemActive('/portal/dashboard/x', '/portal/dashboard')).toBe(false);
  });

  it('lets every other page own its sub-paths, on segment boundaries', () => {
    expect(isNavItemActive('/portal/admin/users', '/portal/admin/users')).toBe(true);
    expect(isNavItemActive('/portal/admin/users/abc', '/portal/admin/users')).toBe(true);
    expect(isNavItemActive('/portal/training/abc', '/portal/training')).toBe(true);
    expect(isNavItemActive('/portal/sales-archive', '/portal/sales')).toBe(false);
  });
});

describe('activeRepHref', () => {
  it('maps paths to the primary destination', () => {
    expect(activeRepHref('/portal/dashboard')).toBe('/portal/dashboard');
    expect(activeRepHref('/portal/sales/new')).toBe('/portal/sales/new');
    expect(activeRepHref('/portal/sales/abc')).toBe('/portal/sales');
    expect(activeRepHref('/portal/chat/general')).toBe('/portal/chat');
    expect(activeRepHref('/portal/settings')).toBeNull();
  });
});
