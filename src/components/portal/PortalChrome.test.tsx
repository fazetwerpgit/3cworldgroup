import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { MobileBottomNav } from './MobileBottomNav';
import { PortalHeader } from './PortalHeader';
import { PortalSidebar } from './PortalSidebar';

type TestUser = {
  status?: string;
  fieldRole?: string;
  role?: string;
  uid?: string;
  displayName?: string;
  email?: string;
};

const testState = vi.hoisted(() => ({
  auth: {
    user: null as TestUser | null,
    hasPermission: () => false,
    isRole: (...roles: string[]) =>
      roles.some((role) => role === testState.auth.user?.role || role === testState.auth.user?.fieldRole),
    signOut: vi.fn(async () => {}),
  },
  pathname: '/portal/onboarding',
  mobileMenuOpen: false,
}));

// Keep the test in the same server-markup style as the existing Task 4 gate test.
// Effects are not needed for these render-only visibility assertions.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: () => {},
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => testState.auth,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => testState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: () => null,
}));

vi.mock('@/contexts/MobileMenuContext', () => ({
  useMobileMenu: () => ({
    isOpen: testState.mobileMenuOpen,
    toggle: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@/hooks/chat/useChatChannels', () => ({
  useChatChannels: () => ({ channels: [] }),
}));

vi.mock('@/hooks/chat/useChatUnread', () => ({
  useChatUnread: () => ({ anyUnread: false }),
}));

vi.mock('@/hooks/admin/usePendingSignupsCount', () => ({
  usePendingSignupsCount: () => 0,
}));

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePresenceHeartbeat', () => ({
  usePresenceHeartbeat: () => {},
}));

function installBrowserStubs() {
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { dataset: {}, style: { overflow: '' } },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: () => void) => {
      callback();
      return 0;
    },
  });
}

function setUser(user: TestUser | null) {
  testState.auth.user = user;
}

function renderNavigationMarkup() {
  testState.mobileMenuOpen = false;
  const sidebar = renderToStaticMarkup(<PortalSidebar />);

  testState.mobileMenuOpen = true;
  const mobile = renderToStaticMarkup(<MobileBottomNav />);
  const palette = renderToStaticMarkup(
    <CommandPalette open onOpenChange={vi.fn()} />
  );

  return `${sidebar}\n${mobile}\n${palette}`;
}

describe('Task 4 portal navigation gates', () => {
  beforeEach(() => {
    installBrowserStubs();
    setUser({
      status: 'pending',
      fieldRole: 'entry_level_rep',
      uid: 'hire-1',
      displayName: 'New Hire',
      email: 'hire@example.com',
    });
  });

  it('shows My Onboarding for a pending entry-level rep', () => {
    expect(renderNavigationMarkup()).toContain('My Onboarding');
  });

  it('shows My Onboarding for an active entry-level rep', () => {
    setUser({ status: 'active', fieldRole: 'entry_level_rep' });

    expect(renderNavigationMarkup()).toContain('My Onboarding');
  });

  it('hides My Onboarding for an active graduated entry rep', () => {
    setUser({ status: 'active', fieldRole: 'entry_rep' });

    expect(renderNavigationMarkup()).not.toContain('My Onboarding');
  });

  it('hides My Onboarding for an active l1 manager', () => {
    setUser({ status: 'active', fieldRole: 'l1_manager' });

    expect(renderNavigationMarkup()).not.toContain('My Onboarding');
  });
});

describe('Task 4 portal brand link', () => {
  beforeEach(() => {
    installBrowserStubs();
  });

  function renderBrandTag() {
    const markup = renderToStaticMarkup(<PortalHeader />);
    return markup.match(/<a\b[^>]*portal-brand[^>]*>/)?.[0] ?? '';
  }

  it('points a pending hire to their onboarding checklist', () => {
    setUser({ status: 'pending', fieldRole: 'entry_level_rep' });

    expect(renderBrandTag()).toContain('href="/portal/onboarding"');
  });

  it('keeps the dashboard brand link for an active user', () => {
    setUser({ status: 'active', fieldRole: 'entry_rep' });

    expect(renderBrandTag()).toContain('href="/portal/dashboard"');
  });
});
