// Server only. Practice talk mode: a homeowner line spoken by Gemini TTS in the
// session's voice. Gemini answers raw 16-bit mono PCM (24 kHz); the page needs
// a playable file, so it is wrapped in a WAV header here.
//
// The 3.8 TTS models read a plain style sentence aloud and refuse a system
// instruction, so the delivery goes in a bracket tag before the line
// ("[tired, rushed] Hi, sorry, I've got food on the stove."), which they act
// but don't speak. 2.5 flash TTS is capped at 100 requests a day.

/** Tried in order: the next one on a rate limit (429) or a server error (5xx). */
export const PRACTICE_TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'] as const;
export const PRACTICE_TTS_TIMEOUT_MS = 10_000;
const DEFAULT_SAMPLE_RATE = 24_000;

export type TtsFailReason = 'timeout' | 'model_error' | 'bad_response';

/** A 44-byte PCM WAV header (mono, 16-bit) in front of the samples. */
export function pcmToWav(pcm: Buffer, sampleRate = DEFAULT_SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate: rate x 1 channel x 2 bytes
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** What the model is sent: the delivery tag, then the line. Nothing else, or it gets read aloud. */
export function ttsPrompt(tone: readonly string[], text: string): string {
  const tags = tone.map((word) => word.replace(/[[\]]/g, '').trim()).filter(Boolean);
  return tags.length ? `[${tags.join(', ')}] ${text}` : text;
}

type Attempt = { ok: true; wav: Buffer } | { ok: false; reason: TtsFailReason; retry: boolean };

/**
 * One line in one prebuilt voice, as WAV, delivered as `tone` says. The first
 * model that answers wins; a rate limit or server error moves on to the next,
 * all within one timeout.
 */
export async function speakLine(options: {
  apiKey: string;
  voiceName: string;
  tone: readonly string[];
  text: string;
  timeoutMs?: number;
}): Promise<{ ok: true; wav: Buffer; model: string } | { ok: false; reason: TtsFailReason }> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? PRACTICE_TTS_TIMEOUT_MS);
  let failure: TtsFailReason = 'model_error';
  for (const model of PRACTICE_TTS_MODELS) {
    const attempt = await speakWith(model, options, signal);
    if (attempt.ok) return { ok: true, wav: attempt.wav, model };
    failure = attempt.reason;
    if (!attempt.retry) break;
  }
  return { ok: false, reason: failure };
}

async function speakWith(
  model: string,
  options: { apiKey: string; voiceName: string; tone: readonly string[]; text: string },
  signal: AbortSignal
): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: ttsPrompt(options.tone, options.text) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voiceName } } },
        },
      }),
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'model_error', retry: false };
  }
  if (!res.ok) return { ok: false, reason: 'model_error', retry: res.status === 429 || res.status >= 500 };
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: unknown; mimeType?: unknown } }[] } }[];
  } | null;
  const audio = json?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (typeof audio?.data !== 'string' || !audio.data) return { ok: false, reason: 'bad_response', retry: false };
  const bytes = Buffer.from(audio.data, 'base64');
  if (bytes.length === 0) return { ok: false, reason: 'bad_response', retry: false };
  // The lite model answers a finished WAV file ("audio/wav"); the others raw PCM ("audio/L16;codec=pcm;rate=24000").
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return { ok: true, wav: bytes };
  const rate = Number(/rate=(\d+)/.exec(typeof audio.mimeType === 'string' ? audio.mimeType : '')?.[1]);
  return { ok: true, wav: pcmToWav(bytes, Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE) };
}
