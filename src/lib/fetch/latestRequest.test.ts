import { describe, expect, it } from 'vitest';
import { latestRequest } from './latestRequest';

describe('latestRequest', () => {
  it('keeps only the newest request current and aborts the one before', () => {
    const channels = latestRequest();
    const repA = channels.start();
    const repB = channels.start();
    expect(repA.signal.aborted).toBe(true);
    expect(repA.isCurrent()).toBe(false);
    expect(repB.signal.aborted).toBe(false);
    expect(repB.isCurrent()).toBe(true);
  });

  it('retires the open request when the panel closes', () => {
    const channels = latestRequest();
    const repA = channels.start();
    channels.cancel();
    expect(repA.signal.aborted).toBe(true);
    expect(repA.isCurrent()).toBe(false);
    // Reopening starts fresh; the old answer still does not count.
    const again = channels.start();
    expect(again.isCurrent()).toBe(true);
    expect(repA.isCurrent()).toBe(false);
  });
});
