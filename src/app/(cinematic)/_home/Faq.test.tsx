// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Faq from './Faq';

vi.mock('../cinematic-home.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Faq />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const rows = () => Array.from(container.querySelectorAll('details'));
const click = (row: HTMLDetailsElement) =>
  act(() => {
    row.querySelector('summary')!.click();
  });
/** The browser's toggle event is queued as a task, not fired synchronously. */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('Faq', () => {
  it('opens and closes a row on click', async () => {
    const [a] = rows();
    click(a);
    expect(a.open).toBe(true);
    expect(a.dataset.open).toBe('true');
    click(a);
    expect(a.open).toBe(false);
    expect(a.dataset.open).toBe('false');
    await flush();
    expect(a.dataset.open).toBe('false');
  });

  it('adopts a row the browser opened itself (find-in-page) so the next click closes it', async () => {
    const [a] = rows();
    click(a);
    click(a);
    await flush();

    // Find-in-page expands the row directly; no click reaches the component.
    a.open = true;
    await flush();
    expect(a.dataset.open).toBe('true');

    click(a);
    expect(a.open).toBe(false);
    expect(a.dataset.open).toBe('false');
  });

  it('keeps one row open when the browser opens a row itself', async () => {
    const [a, b] = rows();
    click(a);
    await flush();

    b.open = true;
    await flush();
    expect(b.open).toBe(true);
    expect(a.open).toBe(false);
    expect(a.dataset.open).toBe('false');
  });

  it('closes a natively opened row when another row is clicked open', async () => {
    const [a, b] = rows();
    click(a);
    click(a);
    await flush();
    a.open = true;
    await flush();

    click(b);
    expect(b.open).toBe(true);
    expect(a.open).toBe(false);
  });
});
