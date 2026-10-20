// @vitest-environment jsdom
//
// The center + by role: a dual (fiber + solar) rep gets a chooser sheet (Log
// fiber sale / Open solar deck); fiber-only and solar-only reps keep a plain
// link, and the owner viewing as a rep never gets the chooser.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  viewing: false,
  pathname: '/portal/dashboard',
}));

vi.mock('@/lib/app/isNativeApp', () => ({ isNativeApp: () => false, useIsNativeApp: () => false }));
vi.mock('@/lib/app/bridge', () => ({ nativeHaptic: vi.fn() }));
vi.mock('@/lib/app/scrollToTop', () => ({ scrollPageToTop: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => env.pathname }));
vi.mock('next/link', () => ({
  default: ({
    href,
    replace,
    scroll,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean; scroll?: boolean } & {
    ref?: React.Ref<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      data-replace={String(!!replace)}
      data-scroll={String(scroll)}
      {...rest}
      onClick={(event) => {
        rest.onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: env.user }) }));
vi.mock('@/contexts/ViewAsContext', () => ({ useViewAs: () => ({ viewing: env.viewing }) }));
vi.mock('@/components/portal/NavSheet', () => ({ useNavAccess: () => ({ canAccess: () => true }) }));
vi.mock('./useTabPrefetch', () => ({ usePrefetchTabOnTouch: () => () => {} }));
vi.mock('./BodyLayer', () => ({ BodyLayer: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useSheetDismiss', () => ({
  useSheetDismiss: (onClose: () => void) => ({ close: onClose, closing: false, sheetRef: () => {}, backdropRef: () => {} }),
}));

import { RepTabBar } from './RepTabBar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DUAL = { uid: 'u', role: 'rep', fieldRole: 'ae_tier_1', solarRole: 'entry_canvasser' };
const FIBER = { uid: 'u', role: 'rep', fieldRole: 'ae_tier_1' };
const SOLAR = { uid: 'u', solarRole: 'entry_canvasser' };

let container: HTMLDivElement;
let root: Root;

const center = () => container.querySelector<HTMLElement>('[data-slot="rep-tab-bar"] li:nth-child(3) > *');
const dialog = () => container.querySelector('[role="dialog"]');

beforeEach(() => {
  env.viewing = false;
  env.pathname = '/portal/dashboard';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the center + by role', () => {
  it('a dual rep: a button that opens the chooser with both choices, focus on the first', () => {
    env.user = DUAL;
    act(() => root.render(<RepTabBar />));
    const plus = center();
    expect(plus?.tagName).toBe('BUTTON');
    expect(plus?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(plus?.getAttribute('aria-expanded')).toBe('false');
    expect(plus?.textContent).toBe('Log sale');

    act(() => plus?.click());
    expect(dialog()).not.toBeNull();
    expect(plus?.getAttribute('aria-expanded')).toBe('true');
    const choices = [...(dialog()?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    expect(choices.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Log fiber sale', '/portal/sales/new'],
      ['Open solar deck', '/portal/solar/present'],
    ]);
    expect(document.activeElement).toBe(choices[0]);
  });

  it('Escape closes it and focus goes back to the +', () => {
    env.user = DUAL;
    act(() => root.render(<RepTabBar />));
    act(() => center()?.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(center());
  });

  it('Tab cycles inside the sheet (aria-modal)', () => {
    env.user = DUAL;
    act(() => root.render(<RepTabBar />));
    act(() => center()?.click());
    const focusables = [...(dialog()?.querySelectorAll<HTMLElement>('a[href], button') ?? [])];
    const last = focusables[focusables.length - 1];
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(back);
    });
    expect(document.activeElement).toBe(last);
  });

  it('a backdrop tap closes it; a tap inside the sheet does not', () => {
    env.user = DUAL;
    act(() => root.render(<RepTabBar />));
    act(() => center()?.click());
    act(() => {
      dialog()?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(dialog()).not.toBeNull();
    const backdrop = dialog()?.parentElement;
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(dialog()).toBeNull();
  });

  it('picking a choice closes the sheet', () => {
    env.user = DUAL;
    act(() => root.render(<RepTabBar />));
    act(() => center()?.click());
    const deck = [...(dialog()?.querySelectorAll<HTMLAnchorElement>('a') ?? [])][1];
    act(() => deck.click());
    expect(dialog()).toBeNull();
  });

  it('a fiber-only rep keeps the plain Log sale link', () => {
    env.user = FIBER;
    act(() => root.render(<RepTabBar />));
    const plus = center();
    expect(plus?.tagName).toBe('A');
    expect(plus?.getAttribute('href')).toBe('/portal/sales/new');
    act(() => plus?.click());
    expect(dialog()).toBeNull();
  });

  it('a solar-only rep gets no chooser', () => {
    env.user = SOLAR;
    act(() => root.render(<RepTabBar />));
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain('Log sale');
  });

  it('the owner viewing as a dual rep gets no chooser', () => {
    env.user = DUAL;
    env.viewing = true;
    act(() => root.render(<RepTabBar />));
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  });
});
