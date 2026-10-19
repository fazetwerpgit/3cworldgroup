// @vitest-environment jsdom
//
// The listening side's setup: a connection that closes before it's ready is
// reported once, by returning null, not through onLost as well.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'id-token' }));

import { openHandsFreeMic } from './handsFreeMic';

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeSocket | null = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSocket.last = null;
});

describe('openHandsFreeMic', () => {
  it('returns null without calling onLost when the socket closes during setup', async () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ token: 't', url: 'wss://example.test/live' }), { status: 200 }))
    );
    const trackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: trackStop }], getAudioTracks: () => [] } as unknown as MediaStream;
    const events = { onInterim: vi.fn(), onFinal: vi.fn(), onSpeech: vi.fn(), onLost: vi.fn() };

    const opening = openHandsFreeMic({} as AudioContext, Promise.resolve(stream), events);
    await vi.waitFor(() => expect(FakeSocket.last).not.toBeNull());
    // The token was rejected: the server closes before setupComplete.
    FakeSocket.last!.readyState = 3;
    FakeSocket.last!.onclose?.();

    await expect(opening).resolves.toBeNull();
    expect(events.onLost).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
  });
});
