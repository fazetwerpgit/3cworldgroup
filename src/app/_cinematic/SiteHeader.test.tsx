// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SiteHeader from './SiteHeader';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({ default: () => <img alt="" /> }));
vi.mock('./cinematic.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // The layout's shape: the header beside the page content it overlays.
  act(() =>
    root.render(
      <>
        <SiteHeader />
        <main id="main">
          <a href="/x">Behind</a>
        </main>
        <footer id="foot" />
      </>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-controls]')!;
const header = () => container.querySelector('header')!;
const main = () => container.querySelector('#main')!;

function openMenu() {
  act(() => toggle().click());
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
}

describe('SiteHeader mobile menu', () => {
  it('closes on a tap on the backdrop and returns focus to the toggle', () => {
    openMenu();
    act(() => header().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('does not close on a tap inside the sheet', () => {
    openMenu();
    const sheet = document.getElementById(toggle().getAttribute('aria-controls')!)!;
    act(() => sheet.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape', () => {
    openMenu();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('makes the page behind inert while open, and only while open', () => {
    openMenu();
    expect(main().hasAttribute('inert')).toBe(true);
    expect(container.querySelector('#foot')!.hasAttribute('inert')).toBe(true);
    expect(header().hasAttribute('inert')).toBe(false);
    act(() => toggle().click());
    expect(main().hasAttribute('inert')).toBe(false);
  });
});
