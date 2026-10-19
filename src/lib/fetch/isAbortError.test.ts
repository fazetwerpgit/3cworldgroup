// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isAbortError } from './isAbortError';

describe('isAbortError', () => {
  afterEach(() => {
    window.dispatchEvent(new Event('pageshow'));
  });

  it('treats any error on an aborted signal as an abort', () => {
    const controller = new AbortController();
    controller.abort();

    expect(isAbortError(new TypeError('Failed to fetch'), controller.signal)).toBe(true);
    expect(isAbortError(new TypeError('Load failed'), controller.signal)).toBe(true);
  });

  it('recognizes standard AbortError exceptions', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';

    expect(isAbortError(error)).toBe(true);
  });

  it('does not hide a real Chrome network failure on a live request', () => {
    const controller = new AbortController();

    expect(isAbortError(new TypeError('Failed to fetch'), controller.signal)).toBe(false);
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('does not hide a real WebKit network failure on a live request', () => {
    const controller = new AbortController();

    expect(isAbortError(new TypeError('Load failed'), controller.signal)).toBe(false);
  });

  it('ignores Chrome and WebKit teardown errors while the page unloads', () => {
    const controller = new AbortController();
    window.dispatchEvent(new Event('pagehide'));

    expect(isAbortError(new TypeError('Failed to fetch'), controller.signal)).toBe(true);
    expect(isAbortError(new TypeError('Load failed'), controller.signal)).toBe(true);
    expect(isAbortError(new Error('Server exploded'), controller.signal)).toBe(false);
  });

  it('stops ignoring network errors after a back/forward cache restore', () => {
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));

    expect(isAbortError(new TypeError('Load failed'))).toBe(false);
  });

  it('does not hide genuine errors', () => {
    expect(isAbortError(new TypeError('Network request failed'))).toBe(false);
  });
});
