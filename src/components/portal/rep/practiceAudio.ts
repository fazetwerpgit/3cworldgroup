import { getIdToken } from '@/lib/firebase/getIdToken';

// Practice talk mode on the phone: the homeowner's voice arrives as a stream of
// raw 16-bit PCM (POST /api/portal/ask/practice/voice) and is played with Web
// Audio as it comes, chunk after chunk, so it starts about a second after the
// line is ready instead of after the whole line. The AudioContext is made
// inside the Knock tap (iOS only plays audio a tap started) and reused.

/** Waiting for the first audio of a line; past this the phone's own voice reads it. */
const FIRST_AUDIO_TIMEOUT_MS = 12_000;
/** The whole line, once it's playing. */
const LINE_TIMEOUT_MS = 45_000;
/** Played this far behind the first chunk, so a slow stretch of the stream doesn't stutter. */
const START_LEAD_S = 0.25;
/** After a gap in the stream, playing picks up this soon. */
const RESUME_LEAD_S = 0.05;

export interface OpenVoice {
  sampleRate: number;
  /** The first audio bytes, already in. */
  first: Uint8Array;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}

export interface VoicePlayer {
  /** Plays a voice to its end (or until stop()). */
  play(voice: OpenVoice): Promise<void>;
  /** Silences what's playing and drops the rest of the stream. */
  stop(): void;
}

/**
 * The homeowner's latest line in the session's voice, once its first audio is
 * in; null when it doesn't come (the page reads the line with the phone's
 * voice then).
 */
export async function openVoice(sessionId: string, text: string): Promise<OpenVoice | null> {
  const controller = new AbortController();
  const firstAudio = setTimeout(() => controller.abort(), FIRST_AUDIO_TIMEOUT_MS);
  setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    const token = await getIdToken();
    const res = await fetch('/api/portal/ask/practice/voice', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text }),
      signal: controller.signal,
    });
    const sampleRate = Number(/rate=(\d+)/.exec(res.headers.get('content-type') ?? '')?.[1]);
    if (!res.ok || !res.body || !(sampleRate > 0)) return null;
    const reader = res.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      if (read.value.length === 0) continue;
      clearTimeout(firstAudio);
      return { sampleRate, first: read.value, reader };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 16-bit little-endian PCM bytes as Web Audio samples. A chunk can end in the
 * middle of a sample: that byte is `carry`, and goes in front of the next.
 */
export function pcmSamples(bytes: Uint8Array, carry: number | null): { samples: Float32Array; carry: number | null } {
  const joined = carry === null ? bytes : new Uint8Array([carry, ...bytes]);
  const count = joined.length >> 1;
  const view = new DataView(joined.buffer, joined.byteOffset, count * 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, carry: joined.length % 2 ? joined[joined.length - 1] : null };
}

type AudioContextClass = typeof AudioContext;

/**
 * Inside a tap: a Web Audio player for the homeowner's voice, unlocked for
 * later plays (iOS), or null where Web Audio is missing. On iPhone the voice
 * plays even with the ring switch on silent, like a video would.
 */
export function unlockVoicePlayer(): VoicePlayer | null {
  const w = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  const Context = w.AudioContext ?? w.webkitAudioContext;
  if (!Context) return null;
  const audioSession = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (audioSession) audioSession.type = 'playback';
  const context = new Context();
  void context.resume().catch(() => {});
  // A silent sample started in the tap is what unlocks the context on iOS.
  const unlock = context.createBufferSource();
  unlock.buffer = context.createBuffer(1, 1, context.sampleRate);
  unlock.connect(context.destination);
  unlock.start();

  let sources = new Set<AudioBufferSourceNode>();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let playing = 0;

  const stop = () => {
    playing += 1;
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    }
    sources = new Set();
    void reader?.cancel().catch(() => {});
    reader = null;
  };

  const play = async (voice: OpenVoice) => {
    stop();
    const mine = playing;
    reader = voice.reader;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    let at = context.currentTime + START_LEAD_S;
    let carry: number | null = null;
    const schedule = (bytes: Uint8Array) => {
      const next = pcmSamples(bytes, carry);
      carry = next.carry;
      if (next.samples.length === 0) return;
      const buffer = context.createBuffer(1, next.samples.length, voice.sampleRate);
      buffer.getChannelData(0).set(next.samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => sources.delete(source);
      at = Math.max(at, context.currentTime + RESUME_LEAD_S);
      source.start(at);
      at += buffer.duration;
      sources.add(source);
    };
    schedule(voice.first);
    try {
      for (let read = await voice.reader.read(); !read.done && playing === mine; read = await voice.reader.read()) {
        schedule(read.value);
      }
    } catch {
      // The stream was cut: what came in plays out.
    }
  };

  return { play, stop };
}
