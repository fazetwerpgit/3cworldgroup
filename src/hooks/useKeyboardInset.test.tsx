// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { receiveNativeMessage } from '@/lib/app/bridge';
import {
  __resetKeyboardForTests,
  keyboardInsetFrom,
  overlapBelowVisible,
  useKeyboardInset,
} from './useKeyboardInset';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('keyboardInsetFrom', () => {
  it('is 0 with the keyboard down', () => {
    expect(keyboardInsetFrom({ innerHeight: 844, height: 844, offsetTop: 0, scale: 1 })).toBe(0);
  });

  it('ignores a small shrink (the URL bar settling)', () => {
    expect(keyboardInsetFrom({ innerHeight: 844, height: 790, offsetTop: 0, scale: 1 })).toBe(0);
  });

  it('measures the keyboard', () => {
    expect(keyboardInsetFrom({ innerHeight: 844, height: 508, offsetTop: 0, scale: 1 })).toBe(336);
  });

  it('subtracts what Safari panned the page by', () => {
    expect(keyboardInsetFrom({ innerHeight: 844, height: 508, offsetTop: 200, scale: 1 })).toBe(136);
  });

  it('reads a pinch zoom as no keyboard', () => {
    expect(keyboardInsetFrom({ innerHeight: 844, height: 400, offsetTop: 0, scale: 2 })).toBe(0);
  });
});

describe('overlapBelowVisible', () => {
  it('is 0 when the box clears the keyboard', () => {
    expect(overlapBelowVisible(400, { offsetTop: 0, height: 508 })).toBe(0);
  });

  it('is how far the box must rise, with the margin', () => {
    expect(overlapBelowVisible(600, { offsetTop: 0, height: 508 }, 12)).toBe(104);
  });

  it('counts a panned visual viewport', () => {
    expect(overlapBelowVisible(600, { offsetTop: 100, height: 508 }, 12)).toBe(4);
  });
});

describe('useKeyboardInset', () => {
  let container: HTMLDivElement;
  let root: Root;
  const vv = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });

  function Probe() {
    const { inset, viewportHeight } = useKeyboardInset();
    return <output id="kb">{`${inset}/${viewportHeight}`}</output>;
  }
  const shown = () => document.getElementById('kb')?.textContent;

  beforeEach(async () => {
    __resetKeyboardForTests();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    vv.height = 844;
    vv.offsetTop = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('follows the visual viewport as the keyboard opens and closes', async () => {
    expect(shown()).toBe('0/0');
    await act(async () => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(shown()).toBe('344/500');
    await act(async () => {
      vv.height = 844;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(shown()).toBe('0/0');
  });

  it('updates every mounted consumer (Ask and Practice at once)', async () => {
    function Second() {
      const { inset } = useKeyboardInset();
      return <output id="kb2">{String(inset)}</output>;
    }
    const extra = document.createElement('div');
    document.body.appendChild(extra);
    const second = createRoot(extra);
    await act(async () => second.render(<Second />));
    await act(async () => {
      vv.height = 520;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(shown()).toBe('324/520');
    expect(document.getElementById('kb2')?.textContent).toBe('324');
    // One consumer leaving keeps the other live.
    act(() => second.unmount());
    extra.remove();
    await act(async () => {
      vv.height = 844;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(shown()).toBe('0/0');
  });
});

describe('useKeyboardInset in the app (keyboard bridge event)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const vv = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  const win = window as Window & { __3C_APP__?: boolean };

  function Probe() {
    const { inset, viewportHeight } = useKeyboardInset();
    return <output id="kbn">{`${inset}/${viewportHeight}`}</output>;
  }
  const shown = () => document.getElementById('kbn')?.textContent;
  const keyboard = (height: number) =>
    receiveNativeMessage({ source: '3c-shell', type: 'keyboard', height, duration: 250, easing: 'keyboard' });

  beforeEach(async () => {
    __resetKeyboardForTests();
    win.__3C_APP__ = true;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    vv.height = 844;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete win.__3C_APP__;
  });

  it('takes the shell event before the viewport resizes, then ignores the viewport', async () => {
    await act(async () => keyboard(336));
    expect(shown()).toBe('336/508');
    // The late viewport resize does not change the answer.
    await act(async () => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(shown()).toBe('336/508');
    await act(async () => keyboard(0));
    expect(shown()).toBe('0/0');
  });

  it('keeps the viewport path until the shell sends one', async () => {
    await act(async () => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(shown()).toBe('344/500');
  });
});
