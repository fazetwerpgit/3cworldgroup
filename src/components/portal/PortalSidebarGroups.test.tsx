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
  it('puts Recruiting directly above Operations with its own four items', () => {
    const labels = portalNavGroups.map((group) => group.label);
    expect(labels.indexOf('Recruiting')).toBe(labels.indexOf('Operations') - 1);

    const recruiting = portalNavGroups.find((group) => group.label === 'Recruiting');
    expect(recruiting?.items.map((item) => item.href)).toEqual([
      '/portal/admin/pipeline',
      '/portal/admin/manager-interviews',
      '/portal/admin/recruiting',
      '/portal/admin/onboarding',
    ]);

    const operations = portalNavGroups.find((group) => group.label === 'Operations');
    expect(operations?.items.map((item) => item.label)).toEqual([
      'Ops Home',
      'University Content',
      'Fiber Reports',
      'Expedite Orders',
      'Payroll Disputes',
      'Leads Requests',
      'Email Templates',
      'Bug Reports',
    ]);
  });

  it('marks Recruiting and Operations collapsible and leaves the other groups alone', () => {
    const collapsible = portalNavGroups
      .filter((group) => group.collapsible)
      .map((group) => group.label);
    expect(collapsible).toEqual(['Recruiting', 'Operations']);
  });
});

describe('PortalSidebar collapsible groups', () => {
  it('renders a collapsible group closed by default', () => {
    render();

    expect(groupToggle('Operations').getAttribute('aria-expanded')).toBe('false');
    expect(groupItems('Operations').hasAttribute('hidden')).toBe(true);
    expect(groupToggle('Recruiting').getAttribute('aria-expanded')).toBe('false');
    expect(groupItems('Recruiting').hasAttribute('hidden')).toBe(true);
  });

  it('opens a group when its toggle is clicked, and persists the choice', () => {
    render();

    act(() => {
      groupToggle('Operations').click();
    });

    expect(groupToggle('Operations').getAttribute('aria-expanded')).toBe('true');
    expect(groupItems('Operations').hasAttribute('hidden')).toBe(false);
    // Sibling groups are unaffected.
    expect(groupToggle('Recruiting').getAttribute('aria-expanded')).toBe('false');

    expect(JSON.parse(window.localStorage.getItem('portal-rail-groups-open') ?? '{}')).toEqual({
      Operations: true,
    });
  });

  it('closes an open group on a second click', () => {
    render();

    act(() => {
      groupToggle('Operations').click();
    });
    act(() => {
      groupToggle('Operations').click();
    });

    expect(groupItems('Operations').hasAttribute('hidden')).toBe(true);
  });

  it('auto-expands the group holding the current page', () => {
    testState.pathname = '/portal/admin/pipeline';
    render();

    expect(groupToggle('Recruiting').getAttribute('aria-expanded')).toBe('true');
    expect(groupItems('Recruiting').hasAttribute('hidden')).toBe(false);
    // Operations no longer owns the recruiting routes, so it stays closed.
    expect(groupToggle('Operations').getAttribute('aria-expanded')).toBe('false');
  });

  it('lets a manual toggle close an auto-expanded group', () => {
    testState.pathname = '/portal/admin/pipeline';
    render();

    act(() => {
      groupToggle('Recruiting').click();
    });

    expect(groupItems('Recruiting').hasAttribute('hidden')).toBe(true);
  });

  it('restores a stored open group on mount', () => {
    window.localStorage.setItem('portal-rail-groups-open', JSON.stringify({ Operations: true }));
    render();

    expect(groupItems('Operations').hasAttribute('hidden')).toBe(false);
    expect(groupItems('Recruiting').hasAttribute('hidden')).toBe(true);
  });

  it('drops the toggles entirely when the rail is in icon-only mode', () => {
    window.localStorage.setItem('3c-rail-collapsed', 'true');
    render();

    expect(container.querySelector('.portal-rail-sidebar.is-collapsed')).not.toBeNull();
    expect(container.querySelectorAll('.portal-rail-group-toggle')).toHaveLength(0);
    const hiddenItems = container.querySelectorAll('.portal-rail-group-items[hidden]');
    expect(hiddenItems).toHaveLength(0);
  });

  it('keeps non-collapsible groups as plain labels with visible items', () => {
    render();

    const labels = Array.from(container.querySelectorAll('.portal-rail-group-label')).map(
      (node) => node.textContent
    );
    expect(labels).toContain('Resources');
    expect(labels).not.toContain('Operations');

    const resources = Array.from(container.querySelectorAll('.portal-rail-group')).find((node) =>
      node.querySelector('.portal-rail-group-label')?.textContent === 'Resources'
    );
    const items = resources?.querySelector('.portal-rail-group-items');
    expect(items?.hasAttribute('hidden')).toBe(false);
    expect(items?.hasAttribute('id')).toBe(false);
  });
});
