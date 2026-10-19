// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { disableBackGestures } from './backGestures';

let posted: Array<Record<string, unknown>> = [];

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

afterEach(() => enterApp(false));

describe('disableBackGestures', () => {
  it('turns the gestures off in the app and back on at restore', () => {
    enterApp(true);
    const restore = disableBackGestures();
    expect(posted).toEqual([{ type: 'backGestures', enabled: false }]);
    restore();
    expect(posted).toEqual([
      { type: 'backGestures', enabled: false },
      { type: 'backGestures', enabled: true },
    ]);
  });

  it('posts nothing on the web', () => {
    enterApp(false);
    const restore = disableBackGestures();
    restore();
    expect(posted).toEqual([]);
  });

  it('is harmless when the app flag is set but the channel is missing', () => {
    enterApp(true);
    delete window.ReactNativeWebView;
    expect(() => disableBackGestures()()).not.toThrow();
    expect(posted).toEqual([]);
  });
});
