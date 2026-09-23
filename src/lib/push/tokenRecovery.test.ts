import { describe, expect, it } from 'vitest';
import { isNetworkPushError, shouldResetPushSubscription } from './tokenRecovery';

// Shaped like Firebase's FirebaseError for messaging/token-subscribe-failed.
function firebaseError(code: string, message: string, errorInfo?: string) {
  return Object.assign(new Error(message), { name: 'FirebaseError', code, customData: { errorInfo } });
}

describe('isNetworkPushError', () => {
  it('recognizes fetch failures, raw or wrapped by Firebase', () => {
    expect(isNetworkPushError(new TypeError('Load failed'))).toBe(true);
    expect(
      isNetworkPushError(
        firebaseError(
          'messaging/token-subscribe-failed',
          'Messaging: A problem occurred while subscribing the user to FCM: TypeError: Failed to fetch (messaging/token-subscribe-failed).',
          'TypeError: Failed to fetch'
        )
      )
    ).toBe(true);
    expect(isNetworkPushError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
    expect(isNetworkPushError(new Error('The Internet connection appears to be offline.'))).toBe(true);
  });

  it('treats a rejected or broken subscription as not a network error', () => {
    expect(
      isNetworkPushError(
        firebaseError(
          'messaging/token-subscribe-failed',
          'Messaging: A problem occurred while subscribing the user to FCM: Requested entity was not found. (messaging/token-subscribe-failed).'
        )
      )
    ).toBe(false);
    expect(
      isNetworkPushError(Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' }))
    ).toBe(false);
    expect(isNetworkPushError(null)).toBe(false);
  });
});

describe('shouldResetPushSubscription', () => {
  const broken = new Error('Registration failed - push service error');

  it('resets a broken subscription only while online', () => {
    expect(shouldResetPushSubscription({ online: true, error: broken })).toBe(true);
    expect(shouldResetPushSubscription({ online: false, error: broken })).toBe(false);
  });

  it('keeps the subscription on a network failure even when the device says online', () => {
    expect(shouldResetPushSubscription({ online: true, error: new TypeError('Failed to fetch') })).toBe(false);
  });
});
