// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ native: true }));
vi.mock('./isNativeApp', () => ({ isNativeApp: () => env.native }));

import { allowPageZoom, installZoomCap, stripZoomCap, withZoomCap } from './viewportZoom';

const BASE = 'width=device-width, initial-scale=1, viewport-fit=cover';
let meta: HTMLMetaElement;

beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = BASE;
  document.head.appendChild(meta);
});

afterEach(() => {
  meta.remove();
});

describe('viewport zoom cap', () => {
  it('adds and strips the scale-1 cap', () => {
    expect(withZoomCap(BASE)).toBe(`${BASE}, maximum-scale=1`);
    expect(stripZoomCap(`${BASE}, maximum-scale=5, user-scalable=no`)).toBe(BASE);
    expect(withZoomCap('')).toBe('width=device-width, initial-scale=1, maximum-scale=1');
  });

  it('caps in the app, lifts while the image viewer is open, and caps again after', () => {
    const uninstall = installZoomCap();
    expect(meta.content).toBe(`${BASE}, maximum-scale=1`);
    const releaseA = allowPageZoom();
    const releaseB = allowPageZoom();
    expect(meta.content).toBe(BASE);
    releaseA();
    releaseA();
    expect(meta.content).toBe(BASE);
    releaseB();
    expect(meta.content).toBe(`${BASE}, maximum-scale=1`);
    uninstall();
    expect(meta.content).toBe(BASE);
  });

  it('does nothing on the web', () => {
    env.native = false;
    const uninstall = installZoomCap();
    expect(meta.content).toBe(BASE);
    uninstall();
    env.native = true;
  });
});
