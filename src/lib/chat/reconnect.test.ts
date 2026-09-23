import { describe, it, expect } from 'vitest';
import {
  RESUME_HIDDEN_THRESHOLD_MS,
  RESUME_MIN_INTERVAL_MS,
  connectionNotice,
  shouldCycleNetwork,
} from './reconnect';

const idle = { hiddenForMs: 0, sinceLastCycleMs: Number.POSITIVE_INFINITY, online: true };

describe('shouldCycleNetwork', () => {
  it('reconnects after a real suspension, not a quick glance away', () => {
    expect(shouldCycleNetwork({ ...idle, reason: 'visible', hiddenForMs: RESUME_HIDDEN_THRESHOLD_MS })).toBe(true);
    expect(shouldCycleNetwork({ ...idle, reason: 'visible', hiddenForMs: RESUME_HIDDEN_THRESHOLD_MS - 1 })).toBe(false);
  });

  it('always reconnects on online and back/forward-cache restores', () => {
    expect(shouldCycleNetwork({ ...idle, reason: 'online' })).toBe(true);
    expect(shouldCycleNetwork({ ...idle, reason: 'pageshow' })).toBe(true);
  });

  it('never cycles while offline or twice in quick succession', () => {
    expect(shouldCycleNetwork({ ...idle, reason: 'online', online: false })).toBe(false);
    expect(
      shouldCycleNetwork({ ...idle, reason: 'pageshow', sinceLastCycleMs: RESUME_MIN_INTERVAL_MS - 1 })
    ).toBe(false);
  });
});

describe('connectionNotice', () => {
  it('says offline whenever the device is offline', () => {
    expect(connectionNotice({ online: false, fromCache: false, rendered: false })).toBe('offline');
  });

  it('says reconnecting only for a rendered, unconfirmed view', () => {
    expect(connectionNotice({ online: true, fromCache: true, rendered: true })).toBe('reconnecting');
    expect(connectionNotice({ online: true, fromCache: true, rendered: false })).toBeNull();
    expect(connectionNotice({ online: true, fromCache: false, rendered: true })).toBeNull();
  });
});
