import { describe, it, expect } from 'vitest';
import { isIosSafari, shouldShowAddToHomeScreen } from './addToHomeScreen';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

describe('isIosSafari', () => {
  it('matches iPhone and iPad Safari', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPAD_SAFARI)).toBe(true);
  });

  it('rejects third-party iOS browsers', () => {
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(IPHONE_FIREFOX)).toBe(false);
  });

  it('rejects desktop Safari and Android', () => {
    expect(isIosSafari(MAC_SAFARI)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
  });
});

describe('shouldShowAddToHomeScreen', () => {
  it('shows on iPhone Safari when not installed and not dismissed', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: false })).toBe(true);
  });

  it('hides when already running as an installed app', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_SAFARI, standalone: true, dismissed: false })).toBe(false);
  });

  it('hides when the user dismissed it', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: true })).toBe(false);
  });

  it('hides everywhere that is not iOS Safari', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_CHROME, standalone: false, dismissed: false })).toBe(false);
    expect(shouldShowAddToHomeScreen({ userAgent: MAC_SAFARI, standalone: false, dismissed: false })).toBe(false);
    expect(shouldShowAddToHomeScreen({ userAgent: ANDROID_CHROME, standalone: false, dismissed: false })).toBe(false);
  });
});
