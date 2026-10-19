// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installStatusBarSync, overrideStatusBar, statusBarStyleFor } from './statusBar';

let posted: Array<Record<string, unknown>>;
let uninstall: () => void = () => {};

function enterApp(inApp: boolean) {
  posted = [];
  if (inApp) {
    window.__3C_APP__ = true;
    window.ReactNativeWebView = { postMessage: (m: string) => void posted.push(JSON.parse(m)) };
  } else {
    delete window.__3C_APP__;
    delete window.ReactNativeWebView;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.className = '';
  document.body.removeAttribute('data-status-bar');
});
afterEach(() => {
  uninstall();
  uninstall = () => {};
  enterApp(false);
});

describe('statusBarStyleFor', () => {
  it('uses light text on the dark theme and dark text on the light chrome', () => {
    document.body.className = 'portal-scope dark';
    expect(statusBarStyleFor(document.body)).toBe('light');
    document.body.className = 'portal-scope';
    expect(statusBarStyleFor(document.body)).toBe('dark');
  });

  it("stays light until the theme classes are applied", () => {
    document.body.className = '';
    expect(statusBarStyleFor(document.body)).toBe('light');
    expect(statusBarStyleFor(null)).toBe('light');
  });
});

describe('overrideStatusBar', () => {
  it('a light page pins dark text over the dark theme, and the restore hands back to the theme', () => {
    document.body.className = 'portal-scope dark';
    const restore = overrideStatusBar('dark');
    expect(statusBarStyleFor(document.body)).toBe('dark');
    restore();
    expect(document.body.hasAttribute('data-status-bar')).toBe(false);
    expect(statusBarStyleFor(document.body)).toBe('light');
  });

  it('in the app: sends the override and the theme style again after it is lifted', async () => {
    enterApp(true);
    document.body.className = 'portal-scope dark';
    uninstall = installStatusBarSync();
    const restore = overrideStatusBar('dark');
    await flush();
    restore();
    await flush();
    expect(posted).toEqual([
      { type: 'statusBar', style: 'light' },
      { type: 'statusBar', style: 'dark' },
      { type: 'statusBar', style: 'light' },
    ]);
  });
});

describe('installStatusBarSync', () => {
  it('in the app: sends the style on mount and on every theme change, once per change', async () => {
    enterApp(true);
    document.body.className = 'portal-scope dark';
    uninstall = installStatusBarSync();
    expect(posted).toEqual([{ type: 'statusBar', style: 'light' }]);

    document.body.classList.remove('dark');
    await flush();
    expect(posted.at(-1)).toEqual({ type: 'statusBar', style: 'dark' });
    expect(posted).toHaveLength(2);

    document.body.classList.add('some-other-class');
    await flush();
    expect(posted).toHaveLength(2);

    document.body.classList.add('dark');
    await flush();
    expect(posted).toEqual([
      { type: 'statusBar', style: 'light' },
      { type: 'statusBar', style: 'dark' },
      { type: 'statusBar', style: 'light' },
    ]);
  });

  it('does not flash dark when it starts before ThemeProvider adds the classes', async () => {
    enterApp(true);
    document.body.className = '';
    uninstall = installStatusBarSync();
    document.body.classList.add('portal-scope', 'dark');
    await flush();
    expect(posted).toEqual([{ type: 'statusBar', style: 'light' }]);
  });

  it('stops after uninstall', async () => {
    enterApp(true);
    uninstall = installStatusBarSync();
    uninstall();
    uninstall = () => {};
    const before = posted.length;
    document.body.classList.add('dark');
    await flush();
    expect(posted).toHaveLength(before);
  });

  it('on the web: does nothing', async () => {
    enterApp(false);
    uninstall = installStatusBarSync();
    document.body.classList.add('dark');
    await flush();
    expect(posted).toEqual([]);
  });
});
