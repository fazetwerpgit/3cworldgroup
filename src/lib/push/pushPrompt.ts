// Visibility rules for the first-run "Turn on notifications?" prompt. Kept pure — the
// browser facts come in as plain values — so the conditions are testable in the
// project's DOM-less Vitest environment, leaving the component a thin shell.

export const PUSH_PROMPT_SNOOZE_KEY = '3c-push-prompt-snoozed-at';
export const PUSH_PROMPT_SNOOZE_DAYS = 30;

const SNOOZE_MS = PUSH_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

// Whether a "Not now" is still in effect. Anything unparseable — cleared storage, a
// hand-edited value, a clock that moved backwards — reads as "not snoozed" so the
// prompt comes back rather than disappearing forever.
export function isPushPromptSnoozed(stored: string | null, now: number): boolean {
  if (!stored) return false;
  const snoozedAt = Number(stored);
  if (!Number.isFinite(snoozedAt) || snoozedAt <= 0) return false;
  if (snoozedAt > now) return false;
  return now - snoozedAt < SNOOZE_MS;
}

export interface PushPromptConditions {
  // Signed in with an active account — a pending hire or a signed-out visitor is not asked.
  active: boolean;
  // pushSupported(): this browser does web push AND the VAPID key is configured.
  supported: boolean;
  // 'granted' and 'denied' both retire the prompt for good: permission never returns
  // to 'default' on its own, so no extra "already asked" bookkeeping is needed.
  permission: NotificationPermission;
  snoozedAt: string | null;
  now: number;
}

export function shouldShowPushPrompt({
  active,
  supported,
  permission,
  snoozedAt,
  now,
}: PushPromptConditions): boolean {
  if (!active || !supported) return false;
  if (permission !== 'default') return false;
  return !isPushPromptSnoozed(snoozedAt, now);
}
