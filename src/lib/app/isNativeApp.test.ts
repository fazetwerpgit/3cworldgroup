import { describe, expect, it } from 'vitest';
import { APP_UA_MARKER, isNativeApp, isNativeAppUA, nativeAppVersion } from './isNativeApp';

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const APP = `${WEBVIEW}${APP_UA_MARKER}1.4.2`;

describe('isNativeAppUA', () => {
  it('spots the shell suffix', () => {
    expect(isNativeAppUA(APP)).toBe(true);
  });

  it('is false for Safari, a plain WebView, the PWA and desktop', () => {
    expect(isNativeAppUA(SAFARI)).toBe(false);
    expect(isNativeAppUA(WEBVIEW)).toBe(false);
    expect(isNativeAppUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')).toBe(false);
  });

  it('needs the leading space and the slash, so look-alike names do not match', () => {
    expect(isNativeAppUA(`${WEBVIEW}3CPortalApp/1.0`)).toBe(false);
    expect(isNativeAppUA(`${WEBVIEW} 3CPortalApp`)).toBe(false);
    expect(isNativeAppUA(`${WEBVIEW} My3CPortalApp/1.0`)).toBe(false);
  });

  it('handles missing input', () => {
    expect(isNativeAppUA(undefined)).toBe(false);
    expect(isNativeAppUA(null)).toBe(false);
    expect(isNativeAppUA('')).toBe(false);
  });
});

describe('nativeAppVersion', () => {
  it('reads the version after the marker', () => {
    expect(nativeAppVersion(APP)).toBe('1.4.2');
    expect(nativeAppVersion(`${WEBVIEW}${APP_UA_MARKER}2.0.0 (build 7)`)).toBe('2.0.0');
  });

  it('is null outside the app', () => {
    expect(nativeAppVersion(SAFARI)).toBeNull();
  });
});

describe('isNativeApp', () => {
  it('is true for the UA marker alone', () => {
    expect(isNativeApp({ navigator: { userAgent: APP } })).toBe(true);
  });

  it('is true for the injected flag alone', () => {
    expect(isNativeApp({ __3C_APP__: true, navigator: { userAgent: WEBVIEW } })).toBe(true);
  });

  it('only accepts the flag when it is exactly true', () => {
    expect(isNativeApp({ __3C_APP__: 'true', navigator: { userAgent: SAFARI } })).toBe(false);
    expect(isNativeApp({ __3C_APP__: 1, navigator: { userAgent: SAFARI } })).toBe(false);
  });

  it('is false in a normal browser', () => {
    expect(isNativeApp({ navigator: { userAgent: SAFARI } })).toBe(false);
  });

  it('is false on the server (no window)', () => {
    expect(typeof window).toBe('undefined');
    expect(isNativeApp()).toBe(false);
  });
});
