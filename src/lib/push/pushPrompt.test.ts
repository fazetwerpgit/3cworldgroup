import { describe, expect, it } from 'vitest';
import {
  PUSH_PROMPT_SNOOZE_DAYS,
  PUSH_PROMPT_SNOOZE_KEY,
  isPushPromptSnoozed,
  shouldShowPushPrompt,
  type PushPromptConditions,
} from './pushPrompt';

const NOW = Date.UTC(2026, 7, 18);
const DAY = 24 * 60 * 60 * 1000;

// Every condition satisfied — each test below breaks exactly one of them.
const SHOWABLE: PushPromptConditions = {
  active: true,
  supported: true,
  permission: 'default',
  snoozedAt: null,
  now: NOW,
};

describe('isPushPromptSnoozed', () => {
  it('snoozes for 30 days', () => {
    expect(PUSH_PROMPT_SNOOZE_DAYS).toBe(30);
  });

  it('is snoozed immediately after a dismissal and a day before the window closes', () => {
    expect(isPushPromptSnoozed(String(NOW), NOW)).toBe(true);
    expect(isPushPromptSnoozed(String(NOW - 29 * DAY), NOW)).toBe(true);
  });

  it('expires once the full window has passed', () => {
    expect(isPushPromptSnoozed(String(NOW - 30 * DAY), NOW)).toBe(false);
    expect(isPushPromptSnoozed(String(NOW - 90 * DAY), NOW)).toBe(false);
  });

  it('is not snoozed when nothing was ever stored', () => {
    expect(isPushPromptSnoozed(null, NOW)).toBe(false);
    expect(isPushPromptSnoozed('', NOW)).toBe(false);
  });

  it('falls back to showing the prompt on an unparseable value', () => {
    expect(isPushPromptSnoozed('not-a-number', NOW)).toBe(false);
    expect(isPushPromptSnoozed('0', NOW)).toBe(false);
    expect(isPushPromptSnoozed('-5', NOW)).toBe(false);
  });

  it('falls back to showing the prompt when the stamp is in the future', () => {
    // A clock that jumped backwards would otherwise snooze the prompt indefinitely.
    expect(isPushPromptSnoozed(String(NOW + DAY), NOW)).toBe(false);
  });

  it('namespaces the storage key so it cannot collide with other portal keys', () => {
    expect(PUSH_PROMPT_SNOOZE_KEY).toBe('3c-push-prompt-snoozed-at');
  });
});

describe('shouldShowPushPrompt', () => {
  it('shows when push is undecided, supported, and the user is active', () => {
    expect(shouldShowPushPrompt(SHOWABLE)).toBe(true);
  });

  it('stays hidden for a user who is not signed in and active', () => {
    expect(shouldShowPushPrompt({ ...SHOWABLE, active: false })).toBe(false);
  });

  it('stays hidden where push is unsupported or unconfigured', () => {
    expect(shouldShowPushPrompt({ ...SHOWABLE, supported: false })).toBe(false);
  });

  it('never returns once permission has been decided either way', () => {
    expect(shouldShowPushPrompt({ ...SHOWABLE, permission: 'granted' })).toBe(false);
    expect(shouldShowPushPrompt({ ...SHOWABLE, permission: 'denied' })).toBe(false);
  });

  it('stays hidden inside the snooze window and returns after it', () => {
    const snoozedAt = String(NOW - 3 * DAY);
    expect(shouldShowPushPrompt({ ...SHOWABLE, snoozedAt })).toBe(false);
    expect(shouldShowPushPrompt({ ...SHOWABLE, snoozedAt, now: NOW + 28 * DAY })).toBe(true);
  });

  it('keeps a denied permission hidden even after the snooze expires', () => {
    expect(
      shouldShowPushPrompt({
        ...SHOWABLE,
        permission: 'denied',
        snoozedAt: String(NOW - 30 * DAY),
      })
    ).toBe(false);
  });
});
