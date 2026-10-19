// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrivacyPolicyPage from '../privacy/page';
import TermsOfServicePage from '../terms/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const cssProxy = vi.hoisted(() => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }));
vi.mock('../../_cinematic/cinematic.module.css', () => cssProxy);
vi.mock('../../_cinematic/app-legal-bar.module.css', () => cssProxy);
vi.mock('./legal.module.css', () => cssProxy);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.__3C_APP__;
});

const pages = [
  ['/privacy', PrivacyPolicyPage],
  ['/terms', TermsOfServicePage],
] as const;

describe.each(pages)('%s contact links', (_path, Page) => {
  it('links to /contact in a browser', () => {
    act(() => root.render(<Page />));
    expect(container.querySelectorAll('a[href="/contact"]').length).toBe(2);
  });

  it('never leads to the marketing /contact page inside the iOS app', () => {
    window.__3C_APP__ = true;
    act(() => root.render(<Page />));
    expect(container.querySelector('a[href="/contact"]')).toBeNull();
    expect(container.textContent).not.toContain('3cworldgroup.com/contact');
    const mail = [...container.querySelectorAll('a')].filter((a) => a.getAttribute('href') === 'mailto:privacy@3cworldgroup.com');
    // The email line plus the closing button.
    expect(mail.map((a) => a.textContent)).toEqual(['privacy@3cworldgroup.com', 'Email Us']);
  });
});
