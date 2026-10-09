// @vitest-environment jsdom
//
// Read receipts drive "Read by", so a thread left open in a backgrounded tab or
// a suspended home-screen app must not mark messages read.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useChatUnread', () => ({ markChannelRead: vi.fn(async () => {}) }));

import { markChannelRead } from './useChatUnread';
import { MARK_READ_THROTTLE_MS, useMarkChannelRead } from './useMarkChannelRead';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mark = markChannelRead as unknown as ReturnType<typeof vi.fn>;

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

function Probe({ channelId, latest }: { channelId: string; latest: number }) {
  useMarkChannelRead('me', channelId, latest);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  mark.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useMarkChannelRead', () => {
  it('marks the open channel when it opens while visible', () => {
    act(() => root.render(<Probe channelId="c1" latest={1} />));
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith('me', 'c1');
  });

  it('does not mark while the page is hidden, then marks once on return', () => {
    act(() => root.render(<Probe channelId="c1" latest={1} />));
    expect(mark).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(MARK_READ_THROTTLE_MS + 1));

    setVisibility('hidden');
    // Messages keep arriving into the open (backgrounded) thread.
    act(() => root.render(<Probe channelId="c1" latest={2} />));
    act(() => root.render(<Probe channelId="c1" latest={3} />));
    act(() => vi.advanceTimersByTime(MARK_READ_THROTTLE_MS * 3));
    expect(mark).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(mark).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(MARK_READ_THROTTLE_MS * 3));
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it('drops a pending trailing write when the page is hidden', () => {
    act(() => root.render(<Probe channelId="c1" latest={1} />));
    // A burst inside the throttle window schedules one trailing write...
    act(() => root.render(<Probe channelId="c1" latest={2} />));
    expect(mark).toHaveBeenCalledTimes(1);
    // ...which never lands if the reader leaves first.
    setVisibility('hidden');
    act(() => vi.advanceTimersByTime(MARK_READ_THROTTLE_MS * 2));
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it('never marks a channel opened while hidden until the page shows', () => {
    visibility = 'hidden';
    act(() => root.render(<Probe channelId="c1" latest={1} />));
    expect(mark).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it('throttles a burst to one immediate and one trailing write', () => {
    act(() => root.render(<Probe channelId="c1" latest={1} />));
    act(() => root.render(<Probe channelId="c1" latest={2} />));
    act(() => root.render(<Probe channelId="c1" latest={3} />));
    expect(mark).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(MARK_READ_THROTTLE_MS));
    expect(mark).toHaveBeenCalledTimes(2);
  });
});
