// Visibility rules for the first-run "Turn on notifications?" prompt. Kept pure — the
// browser facts come in as plain values — so the conditions are testable in the
// project's DOM-less Vitest environment, leaving the component a thin shell.

export const PUSH_PROMPT_SNOOZE_KEY = '3c-push-prompt-snoozed-at';
export const PUSH_PROMPT_SNOOZE_DAYS = 30;

const SNOOZE_MS = PUSH_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

// Whether a "Not now" is still in effect. Anything unparseable — cleared storage, a
// hand-edited value, a clock that moved backwards — reads as "not snoozed" so the
// prompt comes back rather than disappearing forever.
export function isPushPromptSnoozed(stored: string | null, now: number, windowMs: number = SNOOZE_MS): boolean {
  if (!stored) return false;
  const snoozedAt = Number(stored);
  if (!Number.isFinite(snoozedAt) || snoozedAt <= 0) return false;
  if (snoozedAt > now) return false;
  return now - snoozedAt < windowMs;
}

export interface PushPromptConditions {
  // Signed in with an active account — a pending hire or a signed-out visitor is not asked.
  active: boolean;
  // pushSupported(): this browser does web push AND the VAPID key is configured.
  supported: boolean;
  // 'granted' and 'denied' both retire the prompt for good: permission never returns
  // to 'default' on its own, so no extra "already asked" bookkeeping is needed.
  permission: NotificationPermission;
  // Opened from the home-screen icon. There the setup sheet asks instead (below).
  standalone: boolean;
  snoozedAt: string | null;
  now: number;
}

/** The Home banner: only in a browser tab; the installed app gets the setup sheet. */
export function shouldShowPushPrompt({
  active,
  supported,
  permission,
  standalone,
  snoozedAt,
  now,
}: PushPromptConditions): boolean {
  if (!active || !supported || standalone) return false;
  if (permission !== 'default') return false;
  return !isPushPromptSnoozed(snoozedAt, now);
}

// Phone setup, shown the moment the portal opens on a phone (owner request,
// 2026-10: Miles used Safari, Wil had the app but notifications off).
//   install  - iPhone Safari: add the portal to the home screen. Notifications
//              only exist in the installed app on an iPhone.
//   ask      - installed app, notifications undecided: one tap to turn them on.
//   settings - installed app, the phone said no: steps in the phone's Settings,
//              since the app can never show the system question again.
// "Not now" holds only until the next day.
export const PHONE_SETUP_SNOOZE_KEY = '3c-phone-setup-snoozed-at';
export const PHONE_SETUP_SNOOZE_HOURS = 16;

export type PhoneSetupStep = 'install' | 'ask' | 'settings';

export function phoneSetupStep({
  active,
  supported,
  permission,
  standalone,
  iosSafari,
  snoozedAt,
  now,
}: PushPromptConditions & { iosSafari: boolean }): PhoneSetupStep | null {
  if (!active) return null;
  if (isPushPromptSnoozed(snoozedAt, now, PHONE_SETUP_SNOOZE_HOURS * 60 * 60 * 1000)) return null;
  if (!standalone) return iosSafari ? 'install' : null;
  if (!supported || permission === 'granted') return null;
  return permission === 'default' ? 'ask' : 'settings';
}
