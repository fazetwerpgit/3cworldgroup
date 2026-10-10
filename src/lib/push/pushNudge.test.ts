import { describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  NUDGE_SNOOZE_MS,
  PERSON_PUSH_LABEL,
  REQUIRED_SNOOZE_MS,
  devicePushState,
  isSnoozed,
  nudgeView,
  personPushState,
  type DevicePushFacts,
} from './pushNudge';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const NOW = Date.UTC(2026, 9, 9, 12);

const APP: DevicePushFacts = { ua: IPHONE, standalone: true, supported: true, configured: true, permission: 'default' };
const SAFARI_TAB: DevicePushFacts = { ua: IPHONE, standalone: false, supported: false, configured: true, permission: 'no-api' };

describe('devicePushState', () => {
  it('asks for install in an iPhone Safari tab', () => {
    expect(devicePushState(SAFARI_TAB)).toBe('install');
  });

  it('offers the one-tap button in the installed app before the phone has been asked', () => {
    expect(devicePushState(APP)).toBe('ask');
  });

  it('sends a denied app to Settings', () => {
    expect(devicePushState({ ...APP, permission: 'denied' })).toBe('blocked');
  });

  it('is ok once the permission is granted', () => {
    expect(devicePushState({ ...APP, permission: 'granted' })).toBe('ok');
  });

  it('has nothing to say when push is not configured', () => {
    expect(devicePushState({ ...SAFARI_TAB, configured: false })).toBeNull();
    expect(devicePushState({ ...APP, configured: false })).toBeNull();
  });

  it('has nothing to say in a browser that cannot do push', () => {
    expect(devicePushState({ ua: DESKTOP, standalone: false, supported: false, configured: true, permission: 'no-api' })).toBeNull();
    // An old iOS home-screen app without web push.
    expect(devicePushState({ ...APP, supported: false })).toBeNull();
  });

  it('handles a desktop browser like the app: ask, then Settings', () => {
    const desk: DevicePushFacts = { ua: DESKTOP, standalone: false, supported: true, configured: true, permission: 'default' };
    expect(devicePushState(desk)).toBe('ask');
    expect(devicePushState({ ...desk, permission: 'denied' })).toBe('blocked');
    expect(devicePushState({ ...desk, permission: 'granted' })).toBe('ok');
  });
});

describe('isSnoozed', () => {
  it('holds for the window, then lets go', () => {
    expect(isSnoozed(String(NOW), NOW, HOUR_MS)).toBe(true);
    expect(isSnoozed(String(NOW - HOUR_MS + 1), NOW, HOUR_MS)).toBe(true);
    expect(isSnoozed(String(NOW - HOUR_MS), NOW, HOUR_MS)).toBe(false);
  });

  it('treats junk, empty and future values as not snoozed', () => {
    for (const stored of [null, '', 'abc', '0', '-5', String(NOW + 1000)]) {
      expect(isSnoozed(stored, NOW, HOUR_MS)).toBe(false);
    }
  });
});

describe('nudgeView', () => {
  const base = { state: 'ask' as const, required: false, bannerSnoozedAt: null, requiredSnoozedAt: null, now: NOW };

  it('shows the banner, and the sheet for a required person', () => {
    expect(nudgeView(base)).toBe('banner');
    expect(nudgeView({ ...base, required: true })).toBe('sheet');
  });

  it('shows nothing when push already works or cannot work here', () => {
    expect(nudgeView({ ...base, state: 'ok' })).toBeNull();
    expect(nudgeView({ ...base, state: null, required: true })).toBeNull();
  });

  it('snoozes the banner for 24 hours', () => {
    expect(NUDGE_SNOOZE_MS).toBe(24 * HOUR_MS);
    expect(nudgeView({ ...base, bannerSnoozedAt: String(NOW - 23 * HOUR_MS) })).toBeNull();
    expect(nudgeView({ ...base, bannerSnoozedAt: String(NOW - 25 * HOUR_MS) })).toBe('banner');
  });

  it('snoozes the required sheet for only an hour, and ignores the banner snooze', () => {
    expect(REQUIRED_SNOOZE_MS).toBe(HOUR_MS);
    const required = { ...base, required: true };
    expect(nudgeView({ ...required, requiredSnoozedAt: String(NOW - 30 * 60 * 1000) })).toBeNull();
    expect(nudgeView({ ...required, requiredSnoozedAt: String(NOW - 61 * 60 * 1000) })).toBe('sheet');
    expect(nudgeView({ ...required, bannerSnoozedAt: String(NOW) })).toBe('sheet');
  });
});

describe('personPushState', () => {
  it('is on with any registered token', () => {
    expect(personPushState(1, { permission: 'default', standalone: true, ua: IPHONE })).toBe('on');
    expect(personPushState(2, null)).toBe('on');
  });

  it('reads the real tokenless installed-but-never-asked doc as never allowed', () => {
    expect(
      personPushState(0, { result: 'skipped', ua: IPHONE, standalone: true, permission: 'default', supported: true })
    ).toBe('never-allowed');
  });

  it('reads an iPhone Safari tab as not installed', () => {
    expect(personPushState(0, { permission: 'no-api', standalone: false, supported: false, ua: IPHONE })).toBe('not-installed');
  });

  it('reads a denied permission as blocked', () => {
    expect(personPushState(0, { permission: 'denied', standalone: true, ua: IPHONE })).toBe('blocked');
    expect(personPushState(0, { permission: 'denied', standalone: false, ua: DESKTOP })).toBe('blocked');
  });

  it('is unknown with no report, or granted without a token', () => {
    expect(personPushState(0, null)).toBe('unknown');
    expect(personPushState(0, undefined)).toBe('unknown');
    expect(personPushState(0, { permission: 'granted', standalone: true, ua: IPHONE })).toBe('unknown');
  });

  it('labels each state', () => {
    expect(PERSON_PUSH_LABEL['never-allowed']).toBe('Off – never allowed');
    expect(PERSON_PUSH_LABEL.on).toBe('On');
  });
});
