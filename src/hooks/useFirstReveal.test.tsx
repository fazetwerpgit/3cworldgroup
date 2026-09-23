// @vitest-environment jsdom
//
// The first reveal: plays once per session, only once the real content is in,
// and a data refresh never replays or cancels it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useFirstReveal } from './useFirstReveal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let seen: boolean[] = [];

function Probe({ ready }: { ready: boolean }) {
  seen.push(useFirstReveal('k', ready));
  return null;
}

const render = (ready: boolean) => act(() => root.render(<Probe ready={ready} />));

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
  seen = [];
});

afterEach(() => {
  act(() => root.unmount());
  window.sessionStorage.clear();
});

describe('useFirstReveal', () => {
  it('waits for the content, then plays once per session', () => {
    render(false);
    expect(seen.at(-1)).toBe(false);
    render(true);
    expect(seen.at(-1)).toBe(true);
    expect(window.sessionStorage.getItem('k')).toBe('1');

    act(() => root.unmount());
    root = createRoot(container);
    render(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('keeps its first decision through data refreshes', () => {
    render(true);
    render(false);
    render(true);
    expect(seen.at(-1)).toBe(true);
  });
});
