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

// The installed app asks the moment it opens (owner request, 2026-10: Wil had the
// app but never turned notifications on). "Not now" holds only until the next
// day, and a phone that said no gets the Settings steps, since the app can never
// show the system question again.
export const PUSH_SETUP_SNOOZE_KEY = '3c-push-setup-snoozed-at';
export const PUSH_SETUP_SNOOZE_HOURS = 16;

export type PushSetupStep = 'ask' | 'settings';

export function pushSetupStep({
  active,
  supported,
  permission,
  standalone,
  snoozedAt,
  now,
}: PushPromptConditions): PushSetupStep | null {
  if (!active || !standalone || !supported || permission === 'granted') return null;
  if (isPushPromptSnoozed(snoozedAt, now, PUSH_SETUP_SNOOZE_HOURS * 60 * 60 * 1000)) return null;
  return permission === 'default' ? 'ask' : 'settings';
}
