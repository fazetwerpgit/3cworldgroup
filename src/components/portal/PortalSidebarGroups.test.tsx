// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portalNavGroups } from './CommandPalette';
import { PortalSidebar } from './PortalSidebar';

const testState = vi.hoisted(() => ({
  pathname: '/portal/dashboard',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { status: 'active', role: 'admin', fieldRole: 'admin', uid: 'admin-1' },
    hasPermission: () => true,
    isRole: (...roles: string[]) => roles.includes('admin'),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => testState.pathname,
}));

// The bottom nav pulls in the chat hooks and is not under test here.
vi.mock('@/components/portal/MobileBottomNav', () => ({
  MobileBottomNav: () => null,
}));

vi.mock('@/hooks/admin/usePendingSignupsCount', () => ({
  usePendingSignupsCount: () => 0,
}));

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<PortalSidebar />);
  });
}

function groupToggle(label: string) {
  const toggle = Array.from(container.querySelectorAll('.portal-rail-group-toggle')).find(
    (node) => node.textContent?.trim() === label
  );
  if (!toggle) throw new Error(`No collapsible group toggle labelled "${label}"`);
  return toggle as HTMLButtonElement;
}

function groupItems(label: string) {
  const id = groupToggle(label).getAttribute('aria-controls');
  const items = id ? container.querySelector(`#${id}`) : null;
  if (!items) throw new Error(`Toggle "${label}" does not control an items container`);
  return items as HTMLElement;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  testState.pathname = '/portal/dashboard';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('portal nav groups', () => {
  it('keeps the admin side to six pages in one group', () => {
    const admin = portalNavGroups.find((group) => group.label === 'Admin');
    expect(admin?.items.map((item) => item.label)).toEqual([
      'Ops Home',
      'People',
      'Onboarding',
      'Requests',
      'Announcements',
      'Settings',
    ]);
    const adminHrefs = portalNavGroups
      .flatMap((group) => group.items)
      .filter((item) => item.href.startsWith('/portal/admin'));
    expect(adminHrefs).toHaveLength(6);
  });
});

describe('PortalSidebar collapsible groups', () => {
  it('renders a collapsible group closed by default', () => {
    render();

    expect(groupToggle('Admin').getAttribute('aria-expanded')).toBe('false');
    expect(groupItems('Admin').hasAttribute('hidden')).toBe(true);
  });

  it('opens a group when its toggle is clicked, and persists the choice', () => {
    render();

    act(() => {
      groupToggle('Admin').click();
    });

    expect(groupToggle('Admin').getAttribute('aria-expanded')).toBe('true');
    expect(groupItems('Admin').hasAttribute('hidden')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('portal-rail-groups-open') ?? '{}')).toEqual({
      Admin: true,
    });
  });

  it('closes an open group on a second click', () => {
    render();

    act(() => {
      groupToggle('Admin').click();
    });
    act(() => {
      groupToggle('Admin').click();
    });

    expect(groupItems('Admin').hasAttribute('hidden')).toBe(true);
  });

  it('auto-expands the group holding the current page', () => {
    testState.pathname = '/portal/admin/people';
    render();

    expect(groupToggle('Admin').getAttribute('aria-expanded')).toBe('true');
    expect(groupItems('Admin').hasAttribute('hidden')).toBe(false);
  });

  it('lets a manual toggle close an auto-expanded group', () => {
    testState.pathname = '/portal/admin/people';
    render();

    act(() => {
      groupToggle('Admin').click();
    });

    expect(groupItems('Admin').hasAttribute('hidden')).toBe(true);
  });

  it('restores a stored open group on mount', () => {
    window.localStorage.setItem('portal-rail-groups-open', JSON.stringify({ Admin: true }));
    render();

    expect(groupItems('Admin').hasAttribute('hidden')).toBe(false);
  });

  it('drops the toggles entirely when the rail is in icon-only mode', () => {
    window.localStorage.setItem('3c-rail-collapsed', 'true');
    render();

    expect(container.querySelector('.portal-rail-sidebar.is-collapsed')).not.toBeNull();
    expect(container.querySelectorAll('.portal-rail-group-toggle')).toHaveLength(0);
    const hiddenItems = container.querySelectorAll('.portal-rail-group-items[hidden]');
    expect(hiddenItems).toHaveLength(0);
  });

  it('keeps a non-collapsible group always open', () => {
    render();

    const primary = Array.from(container.querySelectorAll('.portal-rail-group')).find((node) =>
      node.querySelector('a[href="/portal/learn"]')
    );
    const items = primary?.querySelector('.portal-rail-group-items');
    expect(items?.hasAttribute('hidden')).toBe(false);
    expect(items?.hasAttribute('id')).toBe(false);
  });
});
