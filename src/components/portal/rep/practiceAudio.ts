import { getIdToken } from '@/lib/firebase/getIdToken';
import type { Ambient } from '@/lib/ask/practiceDoor';

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
/** Porch sounds against the voice (1): clear but under it. */
const EFFECT_GAIN = 0.55;
/** The background bed: well under the voice. */
const AMBIENT_GAIN = 0.16;
const AMBIENT_FADE_S = 1.2;
/** MP3's encoder padding at each end of a bed, skipped so the loop doesn't tick. */
const LOOP_TRIM_S = 0.06;

export interface OpenVoice {
  sampleRate: number;
  /** The first audio bytes, already in. */
  first: Uint8Array;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}

/** The door and porch sounds (public/sounds/practice, all CC0; see its README). */
export type PracticeEffect = 'knock' | 'doorbell' | 'door-open' | 'door-close' | 'door-slam' | 'phone-buzz' | 'kid-whine' | 'pot-boil';

export interface VoicePlayer {
  /** Plays a voice to its end (or until stop()), after `delay` seconds; stops any voice playing. */
  play(voice: OpenVoice, options?: { delay?: number }): Promise<void>;
  /** Plays a voice right after the one playing (the spouse chiming in). */
  queue(voice: OpenVoice): Promise<void>;
  /** Silences the voices and drops the rest of their streams; the porch sounds carry on. */
  stop(): void;
  /** A one-shot door or porch sound, now or right after the voice ends. */
  effect(name: PracticeEffect, options?: { afterVoice?: boolean }): void;
  /** The background under the voices, looped low; null fades it out. */
  ambient(name: Ambient | null): void;
  /** After the last voice: the door shuts (or slams) and the background goes with it. */
  closeDoor(sound: 'door-close' | 'door-slam' | null): void;
  /** A Ring doorbell speaker: the voices come through thin and tinny. */
  setRing(on: boolean): void;
  /** Everything quiet: voices, porch sounds and background. */
  quiet(): void;
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

  // Voices go through their own bus, so the Ring filter can be put in and taken out.
  const voiceBus = context.createGain();
  const ringIn = context.createBiquadFilter();
  ringIn.type = 'highpass';
  ringIn.frequency.value = 500;
  const ringOut = context.createBiquadFilter();
  ringOut.type = 'lowpass';
  ringOut.frequency.value = 3200;
  ringOut.Q.value = 2;
  const ringDrive = context.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
  }
  ringDrive.curve = curve;
  ringIn.connect(ringOut).connect(ringDrive).connect(context.destination);
  voiceBus.connect(context.destination);
  let ring = false;

  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const load = (name: string) => {
    let buffer = buffers.get(name);
    if (!buffer) {
      buffer = fetch(`/sounds/practice/${name}.mp3`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((bytes) => context.decodeAudioData(bytes))
        .catch(() => null);
      buffers.set(name, buffer);
    }
    return buffer;
  };

  let sources = new Set<AudioBufferSourceNode>();
  let effects = new Set<AudioBufferSourceNode>();
  let bed: { source: AudioBufferSourceNode; gain: GainNode; name: Ambient } | null = null;
  /** The background asked for last (its clip may still be loading). */
  let wantedBed: Ambient | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let playing = 0;
  /** When the voice scheduled so far ends. */
  let voiceEnd = 0;

  const halt = (nodes: Set<AudioBufferSourceNode>) => {
    for (const source of nodes) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    }
  };

  const stop = () => {
    playing += 1;
    halt(sources);
    sources = new Set();
    voiceEnd = 0;
    void reader?.cancel().catch(() => {});
    reader = null;
  };

  const stream = async (voice: OpenVoice, startAt: number) => {
    const mine = playing;
    reader = voice.reader;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    let at = startAt;
    let carry: number | null = null;
    const schedule = (bytes: Uint8Array) => {
      const next = pcmSamples(bytes, carry);
      carry = next.carry;
      if (next.samples.length === 0) return;
      const buffer = context.createBuffer(1, next.samples.length, voice.sampleRate);
      buffer.getChannelData(0).set(next.samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(ring ? ringIn : voiceBus);
      source.onended = () => sources.delete(source);
      at = Math.max(at, context.currentTime + RESUME_LEAD_S);
      source.start(at);
      at += buffer.duration;
      voiceEnd = at;
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

  const play = (voice: OpenVoice, options?: { delay?: number }) => {
    stop();
    return stream(voice, context.currentTime + START_LEAD_S + (options?.delay ?? 0));
  };

  const queue = (voice: OpenVoice) =>
    stream(voice, Math.max(voiceEnd + 0.15, context.currentTime + START_LEAD_S));

  const effect = (name: PracticeEffect, options?: { afterVoice?: boolean }) => {
    void load(name).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = EFFECT_GAIN;
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      source.onended = () => effects.delete(source);
      source.start(options?.afterVoice ? Math.max(context.currentTime, voiceEnd + 0.3) : context.currentTime);
      effects.add(source);
    });
  };

  const fadeOut = (current: NonNullable<typeof bed>, from = context.currentTime) => {
    const now = Math.max(from, context.currentTime);
    current.gain.gain.cancelScheduledValues(context.currentTime);
    current.gain.gain.setValueAtTime(AMBIENT_GAIN, now);
    current.gain.gain.linearRampToValueAtTime(0, now + AMBIENT_FADE_S);
    try {
      current.source.stop(now + AMBIENT_FADE_S + 0.05);
    } catch {
      // Already stopped.
    }
  };

  const ambient = (name: Ambient | null) => {
    wantedBed = name;
    if (bed?.name === name) return;
    if (bed) fadeOut(bed);
    bed = null;
    if (!name) return;
    void load(`bed-${name}`).then((buffer) => {
      if (!buffer || bed || wantedBed !== name) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = LOOP_TRIM_S;
      source.loopEnd = Math.max(LOOP_TRIM_S * 2, buffer.duration - LOOP_TRIM_S);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(AMBIENT_GAIN, context.currentTime + AMBIENT_FADE_S);
      source.connect(gain).connect(context.destination);
      source.start(context.currentTime, LOOP_TRIM_S);
      bed = { source, gain, name };
    });
  };

  const closeDoor = (sound: 'door-close' | 'door-slam' | null) => {
    const at = Math.max(context.currentTime, voiceEnd + 0.3);
    if (sound) {
      void load(sound).then((buffer) => {
        if (!buffer) return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = EFFECT_GAIN;
        source.buffer = buffer;
        source.connect(gain).connect(context.destination);
        source.onended = () => effects.delete(source);
        source.start(Math.max(at, context.currentTime));
        effects.add(source);
      });
    }
    wantedBed = null;
    if (bed) fadeOut(bed, at);
    bed = null;
  };

  const quiet = () => {
    stop();
    halt(effects);
    effects = new Set();
    wantedBed = null;
    if (bed) fadeOut(bed);
    bed = null;
  };

  return {
    play,
    queue,
    stop,
    effect,
    ambient,
    closeDoor,
    setRing: (on: boolean) => {
      ring = on;
    },
    quiet,
  };
}
