import { getIdToken } from '@/lib/firebase/getIdToken';
import { LISTEN_SETUP, type PracticeListenReply } from '@/lib/ask/practiceHandsFree';

// Practice hands-free on the phone: the mic, opened once per practice (iOS
// asks again if it's closed and reopened), runs through an AudioWorklet that
// makes 16 kHz 16-bit PCM, and streams to Gemini live transcription over a
// WebSocket with a token from POST /api/portal/ask/practice/listen. The page
// gets the words as they're heard (interim), each finished stretch (final),
// and when the rep starts and stops talking, from the mic's own loudness (a
// pause is caught here, not by waiting on the server, and the server is told
// at once so it finishes the words quickly).

/** Quiet for this long after talking: the rep has stopped. */
export const END_SILENCE_MS = 700;
/** Loud for this long: the rep started talking (a cough or a door bang is shorter). */
const START_SPEECH_MS = 200;
const FRAME_MS = 100;
/** Never call it speech below this RMS, however quiet the room. */
const MIN_SPEECH_RMS = 0.012;
/** Speech is this many times the room's noise. */
const SPEECH_OVER_NOISE = 2.5;

export interface HandsFreeEvents {
  /** The words heard so far in the stretch being spoken (replaced as it firms up). */
  onInterim(text: string): void;
  /** A finished stretch of words. */
  onFinal(text: string): void;
  /** The rep started (true) or stopped (false) talking; `at` is when (performance.now()). */
  onSpeech(speaking: boolean, at: number): void;
  /** The mic or the connection is gone (an error, the phone took the mic for a call). */
  onLost(): void;
}

export interface HandsFreeMic {
  /** The rep stopped: have the server finish the words now, without its own wait. */
  finish(): void;
  close(): void;
}

/** Whether this browser can do hands-free at all. */
export function canHandsFree(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof WebSocket !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/**
 * Inside a tap: the mic, with the phone's echo cancelling on (the homeowner
 * plays from the same phone), and the audio session switched to play-and-record
 * first so iOS routes both the same way.
 */
export function askForMic(): Promise<MediaStream> {
  const audioSession = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (audioSession) audioSession.type = 'play-and-record';
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Opens the listening side; null when it can't (no token, the connection or the mic failed). */
export async function openHandsFreeMic(
  context: AudioContext,
  mic: Promise<MediaStream>,
  events: HandsFreeEvents
): Promise<HandsFreeMic | null> {
  let stream: MediaStream | null = null;
  let ws: WebSocket | null = null;
  let node: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let sink: GainNode | null = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (node) node.port.onmessage = null;
    source?.disconnect();
    node?.disconnect();
    sink?.disconnect();
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    // Back to playback only, as the voice player set it (plays on silent, no mic routing).
    const audioSession = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (audioSession) audioSession.type = 'playback';
  };
  const lost = () => {
    if (closed) return;
    close();
    events.onLost();
  };

  try {
    const [micStream, token] = await Promise.all([mic, listenToken()]);
    stream = micStream;
    if (!token) {
      close();
      return null;
    }
    const socket = new WebSocket(`${token.url}?access_token=${encodeURIComponent(token.token)}`);
    ws = socket;
    const ready = Promise.withResolvers<boolean>();
    const timer = window.setTimeout(() => ready.resolve(false), 8_000);
    socket.onopen = () => socket.send(JSON.stringify({ setup: LISTEN_SETUP }));
    socket.onerror = () => ready.resolve(false);
    socket.onclose = () => {
      ready.resolve(false);
      lost();
    };
    socket.onmessage = async (event) => {
      const raw = typeof event.data === 'string' ? event.data : await (event.data as Blob).text();
      let message: {
        setupComplete?: unknown;
        serverContent?: { interimInputTranscription?: { text?: string }; inputTranscription?: { text?: string } };
      };
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (message.setupComplete) ready.resolve(true);
      const content = message.serverContent;
      if (content?.interimInputTranscription?.text) events.onInterim(content.interimInputTranscription.text);
      if (content?.inputTranscription?.text) events.onFinal(content.inputTranscription.text);
    };
    const ok = await ready.promise;
    window.clearTimeout(timer);
    if (!ok || closed) {
      close();
      return null;
    }

    await context.audioWorklet.addModule('/practice-mic-worklet.js');
    if (closed) return null;
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'practice-mic');
    // Pulled through a silent gain so every browser runs it; nothing of the mic is heard.
    sink = context.createGain();
    sink.gain.value = 0;
    source.connect(node).connect(sink).connect(context.destination);
    for (const track of stream.getAudioTracks()) track.onended = lost;

    let noise = MIN_SPEECH_RMS / SPEECH_OVER_NOISE;
    let loudMs = 0;
    let quietMs = 0;
    let speaking = false;
    node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      const { pcm, rms } = event.data;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ realtimeInput: { audio: { data: base64(pcm), mimeType: 'audio/pcm;rate=16000' } } }));
      }
      const loud = rms > Math.max(MIN_SPEECH_RMS, noise * SPEECH_OVER_NOISE);
      // The room's noise: follows quiet frames closely, loud ones barely.
      noise = loud ? noise * 0.999 + rms * 0.001 : noise * 0.9 + rms * 0.1;
      const now = performance.now();
      if (loud) {
        loudMs += FRAME_MS;
        quietMs = 0;
        if (!speaking && loudMs >= START_SPEECH_MS) {
          speaking = true;
          events.onSpeech(true, now - loudMs);
        }
      } else {
        quietMs += FRAME_MS;
        loudMs = 0;
        if (speaking && quietMs >= END_SILENCE_MS) {
          speaking = false;
          events.onSpeech(false, now - quietMs);
        }
      }
    };
  } catch {
    close();
    return null;
  }

  return {
    finish: () => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    },
    close,
  };
}

async function listenToken(): Promise<PracticeListenReply | null> {
  try {
    const token = await getIdToken();
    const res = await fetch('/api/portal/ask/practice/listen', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<PracticeListenReply>;
    return res.ok && typeof json.token === 'string' && typeof json.url === 'string' ? { token: json.token, url: json.url } : null;
  } catch {
    return null;
  }
}
