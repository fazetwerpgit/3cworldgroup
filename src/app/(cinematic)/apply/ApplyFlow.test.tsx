// @vitest-environment jsdom
// /apply: ?market= prefill against the session draft, and the shared phone check.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => nav.params }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import ApplyFlow from './ApplyFlow';

const DRAFT_KEY = '3c:apply-draft';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const field = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;

async function open(query: string) {
  nav.params = new URLSearchParams(query);
  await act(async () => root.render(<ApplyFlow>{null}</ApplyFlow>));
}

async function type(id: string, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(field(id), value);
    field(id).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('ApplyFlow ?market= prefill', () => {
  it('fills City from the market when an empty draft is already in the tab', async () => {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name: '', phone: '', email: '', city: '', referredBy: '' }));
    await open('market=grand-rapids');
    expect(field('apply-city').value).toBe('Grand Rapids');
  });

  it('replaces a city the draft carried, from an earlier link or typed, with the market picked now', async () => {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name: 'Jane', city: 'Houston' }));
    await open('market=lansing');
    expect(field('apply-city').value).toBe('Lansing');
    expect(field('apply-name').value).toBe('Jane');
  });

  it('follows each market link in the same tab after the first one was autosaved', async () => {
    vi.useFakeTimers();
    await open('market=lansing');
    await act(async () => vi.advanceTimersByTime(500));
    expect(JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!).city).toBe('Lansing');

    act(() => root.unmount());
    root = createRoot(container);
    await open('market=dallas');
    expect(field('apply-city').value).toBe('Dallas');
  });

  it('keeps the draft city when the link names no known market', async () => {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ city: 'Houston' }));
    await open('market=atlantis');
    expect(field('apply-city').value).toBe('Houston');
  });
});

describe('ApplyFlow phone check', () => {
  it('blocks a submit with a phone that is not a US number and says why', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await open('');
    await type('apply-name', 'Jane Rep');
    await type('apply-phone', 'abc');
    await type('apply-email', 'jane@example.com');
    await type('apply-city', 'Dallas');

    await act(async () => container.querySelector<HTMLButtonElement>('button[type=submit]')!.click());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('#apply-phone-error')?.textContent).toBe('Enter a valid phone number.');

    await type('apply-phone', '(214) 555-0100');
    expect(field('apply-phone').validity.valid).toBe(true);
  });
});
