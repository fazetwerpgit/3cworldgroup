// Push nudge rules. Kept pure: the browser facts and the stored user fields come
// in as plain values, so every branch is testable in the DOM-less Vitest setup
// and the components stay thin shells.
//
// On an iPhone push only exists in the installed home-screen app, never in a
// Safari tab, and the app can only show the system "Allow" question from a tap.
// A permission the phone has denied never comes back to 'default', so the only
// fix then is the phone's Settings app.

/** What this device needs before it can get push. 'ok' means nothing. */
export type DevicePushState = 'ok' | 'install' | 'ask' | 'blocked';

export interface DevicePushFacts {
  ua: string;
  /** Opened from the home-screen icon (isStandaloneApp). */
  standalone: boolean;
  /** pushSupported(): this browser does web push AND the app is configured for it. */
  supported: boolean;
  /** NEXT_PUBLIC_FIREBASE_VAPID_KEY is set. Without it push is off for everyone. */
  configured: boolean;
  /** Notification.permission, or 'no-api' where there is no Notification at all (an iPhone Safari tab). */
  permission: NotificationPermission | 'no-api';
}

export function isIosDevice(ua: string): boolean {
  return /iPhone|iPad|iPod/.test(ua);
}

/** The app name iOS shows in Settings > Notifications (appleWebApp.title). */
export const APP_NAME = '3C Console';

/**
 * This device's push state. null when there is nothing a person can do here:
 * push is not configured, or a browser that cannot do web push at all.
 */
export function devicePushState({ ua, standalone, supported, configured, permission }: DevicePushFacts): DevicePushState | null {
  if (!configured) return null;
  if (supported && permission === 'granted') return 'ok';
  // An iPhone Safari tab has no Notification API: installing is the only way.
  if (isIosDevice(ua) && !standalone) return 'install';
  if (!supported) return null;
  if (permission === 'denied') return 'blocked';
  if (permission === 'default') return 'ask';
  return null;
}

export const NUDGE_SNOOZE_KEY = '3c-push-nudge-snoozed-at';
export const REQUIRED_SNOOZE_KEY = '3c-push-required-snoozed-at';
export const HOUR_MS = 60 * 60 * 1000;
/** "Not now" on the banner. */
export const NUDGE_SNOOZE_MS = 24 * HOUR_MS;
/** "Not now" on the required sheet. */
export const REQUIRED_SNOOZE_MS = HOUR_MS;

/**
 * Whether a "Not now" is still in effect. Anything unparseable (cleared storage,
 * a hand-edited value, a clock that moved backwards) reads as not snoozed, so
 * the nudge comes back rather than disappearing for good.
 */
export function isSnoozed(stored: string | null, now: number, windowMs: number): boolean {
  if (!stored) return false;
  const at = Number(stored);
  if (!Number.isFinite(at) || at <= 0 || at > now) return false;
  return now - at < windowMs;
}

export type NudgeView = 'banner' | 'sheet';

/**
 * How to nudge: a banner for most people, a full-screen sheet for someone the
 * owner marked as required (users/{uid}.pushRequired). Each has its own snooze.
 */
export function nudgeView({
  state,
  required,
  bannerSnoozedAt,
  requiredSnoozedAt,
  now,
}: {
  state: DevicePushState | null;
  required: boolean;
  bannerSnoozedAt: string | null;
  requiredSnoozedAt: string | null;
  now: number;
}): NudgeView | null {
  if (!state || state === 'ok') return null;
  if (required) return isSnoozed(requiredSnoozedAt, now, REQUIRED_SNOOZE_MS) ? null : 'sheet';
  return isSnoozed(bannerSnoozedAt, now, NUDGE_SNOOZE_MS) ? null : 'banner';
}

// ---------------------------------------------------------------- owner view

/** A person's push state as the owner sees it, from their user doc. */
export type PersonPushState = 'on' | 'not-installed' | 'never-allowed' | 'blocked' | 'unknown';

/** users/{uid}.pushHealth, written by POST /api/portal/push/health on every app open. */
export interface PushHealth {
  permission?: string;
  standalone?: boolean;
  supported?: boolean;
  ua?: string;
  result?: string;
}

/**
 * Registered tokens mean the server has somewhere to send (FCM prunes dead
 * ones). Without any, the last device the person opened the portal on says why.
 */
export function personPushState(tokenCount: number, health: PushHealth | null | undefined): PersonPushState {
  if (tokenCount > 0) return 'on';
  if (!health) return 'unknown';
  if (isIosDevice(health.ua ?? '') && health.standalone !== true) return 'not-installed';
  if (health.permission === 'denied') return 'blocked';
  if (health.permission === 'default') return 'never-allowed';
  return 'unknown';
}

/** One row of GET /api/portal/admin/push. */
export interface PushStatusRow {
  uid: string;
  name: string;
  email: string;
  state: PersonPushState;
  required: boolean;
  /** When the person's device last reported (pushHealth.at), ISO, or null. */
  checkedAt: string | null;
}

export const PERSON_PUSH_LABEL: Record<PersonPushState, string> = {
  on: 'On',
  'not-installed': 'Off – not installed',
  'never-allowed': 'Off – never allowed',
  blocked: 'Off – blocked',
  unknown: 'Unknown',
};
