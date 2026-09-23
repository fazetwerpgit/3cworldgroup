import { describe, it, expect } from 'vitest';
import { bottomGap, type BottomGapInput } from './bottomGap';

// iPhone 15 Pro: 393x852pt screen, 59pt status bar, 34pt home indicator.
const BUGGY_INSTALL: BottomGapInput = {
  standalone: true,
  largeViewportHeight: 852,
  safeAreaTop: 59,
  innerHeight: 793,
  innerWidth: 393,
  screenWidth: 393,
  screenHeight: 852,
};

describe('bottomGap', () => {
  it('measures the strip an iOS 26 install leaves under the bars', () => {
    expect(bottomGap(BUGGY_INSTALL)).toBe(59);
  });

  it('matches a 62pt status bar too (iPhone 16 Pro)', () => {
    expect(
      bottomGap({ ...BUGGY_INSTALL, largeViewportHeight: 874, safeAreaTop: 62, innerHeight: 812, screenHeight: 874 })
    ).toBe(62);
  });

  it('is 0 once the viewport is the full screen', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, innerHeight: 852 })).toBe(0);
  });

  it('is 0 in Safari, where lvh vs the viewport is the toolbar', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, standalone: false, innerHeight: 739 })).toBe(0);
  });

  it('is 0 under an opaque status bar, where a short viewport is correct', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, safeAreaTop: 0 })).toBe(0);
  });

  it('is 0 while the keyboard shrinks the viewport', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, innerHeight: 793 - 336 })).toBe(0);
  });

  it('never takes more than the top inset', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, innerHeight: 783 })).toBe(0);
  });

  it('ignores sub-pixel rounding', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, innerHeight: 851 })).toBe(0);
    expect(bottomGap({ ...BUGGY_INSTALL, largeViewportHeight: 852.4, innerHeight: 852 })).toBe(0);
  });

  it('is 0 on desktop and Android installs', () => {
    expect(
      bottomGap({ ...BUGGY_INSTALL, innerWidth: 1440, innerHeight: 841, largeViewportHeight: 900, screenWidth: 1440, screenHeight: 900 })
    ).toBe(0);
    // Android standalone: no status-bar underlap, lvh equals the viewport.
    expect(
      bottomGap({ ...BUGGY_INSTALL, safeAreaTop: 0, largeViewportHeight: 915, innerHeight: 915, innerWidth: 412, screenWidth: 412, screenHeight: 915 })
    ).toBe(0);
  });

  it('is 0 when lvh is unsupported (probe measures 0)', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, largeViewportHeight: 0 })).toBe(0);
  });

  it('never drops a bar below the physical screen', () => {
    expect(bottomGap({ ...BUGGY_INSTALL, innerHeight: 800, largeViewportHeight: 859 })).toBe(0);
  });

  it('uses the short screen side in landscape', () => {
    const landscape = { ...BUGGY_INSTALL, innerWidth: 852, screenWidth: 393, screenHeight: 852 };
    expect(bottomGap({ ...landscape, innerHeight: 373, largeViewportHeight: 393, safeAreaTop: 20 })).toBe(20);
    expect(bottomGap({ ...landscape, innerHeight: 393, largeViewportHeight: 413, safeAreaTop: 20 })).toBe(0);
  });
});
