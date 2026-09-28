// Server only. Practice talk mode: a homeowner line spoken by Gemini TTS in the
// session's voice. Gemini answers raw 16-bit mono PCM (24 kHz); the page needs
// a playable file, so it is wrapped in a WAV header here.

export const PRACTICE_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
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

/**
 * One line in one prebuilt voice, as WAV. `style` directs the delivery ("Say
 * this like a tired mom answering the door mid-dinner, rushed"); the model
 * does not read it aloud.
 */
export async function speakLine(options: {
  apiKey: string;
  voiceName: string;
  style: string;
  text: string;
  timeoutMs?: number;
}): Promise<{ ok: true; wav: Buffer } | { ok: false; reason: TtsFailReason }> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PRACTICE_TTS_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${options.style}: ${options.text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voiceName } } },
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? PRACTICE_TTS_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'model_error' };
  }
  if (!res.ok) return { ok: false, reason: 'model_error' };
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: unknown; mimeType?: unknown } }[] } }[];
  } | null;
  const audio = json?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (typeof audio?.data !== 'string' || !audio.data) return { ok: false, reason: 'bad_response' };
  // "audio/L16;codec=pcm;rate=24000"
  const rate = Number(/rate=(\d+)/.exec(typeof audio.mimeType === 'string' ? audio.mimeType : '')?.[1]);
  const pcm = Buffer.from(audio.data, 'base64');
  if (pcm.length === 0) return { ok: false, reason: 'bad_response' };
  return { ok: true, wav: pcmToWav(pcm, Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE) };
}
