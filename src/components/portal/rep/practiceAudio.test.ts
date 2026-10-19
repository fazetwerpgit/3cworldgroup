// @vitest-environment jsdom
//
// The practice voice player's Web Audio graph: a Ring voice fades when the rep
// talks over it, and leaving Practice closes the context.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unlockVoicePlayer, type OpenVoice } from './practiceAudio';

type Node = { kind: string; to: Node[]; connect: (node: Node) => Node; gain?: { value: number; ramps: number[] } };

const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  sampleRate = 48_000;
  currentTime = 0;
  state = 'running';
  destination = this.node('destination');
  sources: Node[] = [];
  gains: Node[] = [];
  constructor() {
    contexts.push(this);
  }
  node(kind: string, extra: object = {}): Node {
    const node: Node = { kind, to: [], connect: (next: Node) => (node.to.push(next), next), ...extra };
    return node;
  }
  resume() {
    return Promise.resolve();
  }
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  }
  createGain() {
    const gain = {
      value: 1,
      ramps: [] as number[],
      setValueAtTime() {},
      cancelScheduledValues() {},
      linearRampToValueAtTime(value: number) {
        gain.ramps.push(value);
      },
    };
    const node = this.node('gain', { gain });
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    return this.node('filter', { type: '', frequency: { value: 0 }, Q: { value: 0 } });
  }
  createWaveShaper() {
    return this.node('shaper', { curve: null });
  }
  decodeAudioData() {
    return Promise.reject(new Error('no sounds in tests'));
  }
  createBufferSource() {
    const node = this.node('source', { buffer: null, onended: null, stop() {}, start() {} });
    this.sources.push(node);
    return node;
  }
}

/** The gains a node's sound passes through on its way out. */
function gainsOnPath(node: Node, seen = new Set<Node>()): Node[] {
  if (seen.has(node)) return [];
  seen.add(node);
  return node.to.flatMap((next) => [...(next.kind === 'gain' ? [next] : []), ...gainsOnPath(next, seen)]);
}

function voice(): OpenVoice {
  const reader = { read: () => new Promise<never>(() => {}), cancel: () => Promise.resolve() };
  return { sampleRate: 24_000, first: new Uint8Array([0x00, 0x40]), reader: reader as never };
}

beforeEach(() => {
  contexts.length = 0;
  Object.assign(window, { AudioContext: FakeAudioContext });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).AudioContext;
});

describe('unlockVoicePlayer', () => {
  it('fades a Ring doorbell voice when the rep talks over it, like a porch voice', () => {
    const player = unlockVoicePlayer()!;
    const context = contexts[0];
    player.setRing(true);
    void player.play(voice());
    const ringVoice = context.sources.at(-1)!;
    // The voice bus is the first gain made; the Ring voice ends up in it.
    const voiceBus = context.gains[0];
    expect(gainsOnPath(ringVoice)).toContain(voiceBus);
    player.fadeOut();
    expect(voiceBus.gain!.ramps).toEqual([0]);
  });

  it('closes the context on close(), once', () => {
    const player = unlockVoicePlayer()!;
    player.close();
    player.close();
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(contexts[0].state).toBe('closed');
  });
});
