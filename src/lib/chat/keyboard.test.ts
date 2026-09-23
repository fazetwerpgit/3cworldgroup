import { describe, expect, it } from 'vitest';
import { gifPickerMaxHeight, keyboardInset } from './keyboard';

describe('keyboardInset', () => {
  it('reads the covered height when the keyboard is up', () => {
    expect(keyboardInset({ innerHeight: 852, height: 516, offsetTop: 0, scale: 1 })).toBe(336);
  });

  it('subtracts a Safari pan so the inset is only what the keys cover', () => {
    expect(keyboardInset({ innerHeight: 852, height: 516, offsetTop: 120, scale: 1 })).toBe(216);
  });

  it('ignores small changes from browser chrome', () => {
    expect(keyboardInset({ innerHeight: 852, height: 800, offsetTop: 0, scale: 1 })).toBe(0);
  });

  it('refuses to guess while pinch-zoomed', () => {
    expect(keyboardInset({ innerHeight: 852, height: 426, offsetTop: 200, scale: 2 })).toBeNull();
    expect(keyboardInset({ innerHeight: 852, height: 852, offsetTop: 0, scale: 1.005 })).toBe(0);
  });
});

describe('gifPickerMaxHeight', () => {
  it('uses the full picker when there is room', () => {
    expect(gifPickerMaxHeight(700, 60)).toBe(392);
  });

  it('shrinks to the space above the composer when the keyboard is up', () => {
    // Composer top at 380, thread top at 59 (safe area): 305px left.
    expect(gifPickerMaxHeight(380, 59)).toBe(305);
  });

  it('never goes below a usable minimum, and treats a thread above the screen as the screen top', () => {
    expect(gifPickerMaxHeight(150, 40)).toBe(160);
    expect(gifPickerMaxHeight(300, -80)).toBe(284);
  });
});
