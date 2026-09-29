// Server only. Practice talk mode: a homeowner line spoken by Gemini TTS in the
// session's voice, streamed. Gemini's streamGenerateContent sends the audio as
// server-sent events of raw 16-bit mono PCM (24 kHz); they are passed on as
// one PCM stream as they arrive, so the page starts playing at the first chunk
// (about 1 s) instead of after the whole line (3-5 s). A model that won't
// stream answers the whole line in one piece on the same stream.
//
// The 3.8 TTS models read a plain style sentence aloud and refuse a system
// instruction, so the delivery goes in a bracket tag before the line
// ("[tired, rushed] Hi, sorry, I've got food on the stove."), which they act
// but don't speak. 2.5 flash TTS is capped at 100 requests a day.

/** Tried in order: the next one on a rate limit (429) or a server error (5xx). */
export const PRACTICE_TTS_MODELS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
] as const;
/** The first audio must arrive within this, across the models tried. */
export const PRACTICE_TTS_FIRST_AUDIO_MS = 10_000;
/** And the whole line within this. */
export const PRACTICE_TTS_STREAM_MS = 40_000;
const DEFAULT_SAMPLE_RATE = 24_000;
const API = "https://generativelanguage.googleapis.com/v1beta/models";

export type TtsFailReason = "timeout" | "model_error" | "bad_response";

export interface SpokenLine {
  ok: true;
  model: string;
  sampleRate: number;
  /** From the request to the first audio in hand. */
  firstAudioMs: number;
  /** 16-bit little-endian mono PCM at `sampleRate`, starting with that first audio. */
  pcm: ReadableStream<Uint8Array>;
}

interface Voice {
  apiKey: string;
  voiceName: string;
  tone: readonly string[];
  text: string;
}

/** What the model is sent: the delivery tag, then the line. Nothing else, or it gets read aloud. */
export function ttsPrompt(tone: readonly string[], text: string): string {
  const tags = tone
    .map((word) => word.replace(/[[\]]/g, "").trim())
    .filter(Boolean);
  return tags.length ? `[${tags.join(", ")}] ${text}` : text;
}

/** The samples and rate inside a WAV file (the lite model answers a whole line as one), or null. */
export function pcmFromWav(
  wav: Buffer,
): { pcm: Buffer; sampleRate: number } | null {
  if (
    wav.length < 12 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  )
    return null;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  for (let at = 12; at + 8 <= wav.length;) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt " && at + 16 <= wav.length)
      sampleRate = wav.readUInt32LE(at + 12);
    if (id === "data")
      return {
        pcm: wav.subarray(at + 8, Math.min(wav.length, at + 8 + size)),
        sampleRate,
      };
    at += 8 + size + (size % 2);
  }
  return null;
}

const rateOf = (mimeType: unknown) => {
  const rate = Number(
    /rate=(\d+)/.exec(typeof mimeType === "string" ? mimeType : "")?.[1],
  );
  return Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE;
};

type InlineParts = {
  candidates?: {
    content?: {
      parts?: { inlineData?: { data?: unknown; mimeType?: unknown } }[];
    };
  }[];
};

/** Each audio part of a Gemini answer, as PCM (a WAV unwrapped). */
function* audioParts(
  json: InlineParts | null,
): Generator<{ pcm: Buffer; sampleRate: number }> {
  for (const part of json?.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data;
    if (typeof data !== "string" || !data) continue;
    const bytes = Buffer.from(data, "base64");
    const wav = pcmFromWav(bytes);
    const audio = wav ?? {
      pcm: bytes,
      sampleRate: rateOf(part.inlineData?.mimeType),
    };
    if (audio.pcm.length > 0) yield audio;
  }
}

/** The audio of a streamed answer (server-sent events, one JSON answer each), as it arrives. */
async function* streamedAudio(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ pcm: Buffer; sampleRate: number }> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let pending = "";
  try {
    yield* readEvents();
  } finally {
    // Done, cut off or an error event: let go of the connection.
    reader.cancel().catch(() => {});
  }

  async function* readEvents(): AsyncGenerator<{
    pcm: Buffer;
    sampleRate: number;
  }> {
    for (
      let read = await reader.read();
      !read.done;
      read = await reader.read()
    ) {
      pending += decoder.decode(read.value, { stream: true });
      for (
        let end = pending.search(/\r?\n\r?\n/);
        end >= 0;
        end = pending.search(/\r?\n\r?\n/)
      ) {
        const event = pending.slice(0, end);
        pending = pending.slice(end).replace(/^\r?\n\r?\n/, "");
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!data) continue;
        let json: (InlineParts & { error?: unknown }) | null = null;
        try {
          json = JSON.parse(data);
        } catch {
          return;
        }
        if (json?.error) return;
        yield* audioParts(json);
      }
    }
  }
}

function request(
  model: string,
  method: string,
  voice: Voice,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${API}/${model}:${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": voice.apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: ttsPrompt(voice.tone, voice.text) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } },
        },
      },
    }),
    signal,
  });
}

type Attempt =
  | {
      ok: true;
      sampleRate: number;
      first: Buffer;
      rest: AsyncIterator<{ pcm: Buffer }> | null;
    }
  | { ok: false; reason: TtsFailReason; next: boolean };

const failed = (status: number): Attempt => ({
  ok: false,
  reason: "model_error",
  next: status === 429 || status >= 500,
});

/** One model: streamed if it streams, else the whole line in one piece. */
async function attempt(
  model: string,
  voice: Voice,
  signal: AbortSignal,
): Promise<Attempt> {
  const streamed = await request(
    model,
    "streamGenerateContent?alt=sse",
    voice,
    signal,
  );
  if (streamed.ok && streamed.body) {
    const audio = streamedAudio(streamed.body);
    const first = await audio.next();
    if (first.done) return { ok: false, reason: "bad_response", next: false };
    return {
      ok: true,
      sampleRate: first.value.sampleRate,
      first: first.value.pcm,
      rest: audio,
    };
  }
  if (streamed.status === 429 || streamed.status >= 500)
    return failed(streamed.status);
  // Streaming refused (not a rate limit or an outage): the same model, whole.
  const whole = await request(model, "generateContent", voice, signal);
  if (!whole.ok) return failed(whole.status);
  const parts = [
    ...audioParts((await whole.json().catch(() => null)) as InlineParts | null),
  ];
  if (parts.length === 0)
    return { ok: false, reason: "bad_response", next: false };
  return {
    ok: true,
    sampleRate: parts[0].sampleRate,
    first: Buffer.concat(parts.map((part) => part.pcm)),
    rest: null,
  };
}

/**
 * One line in one prebuilt voice, delivered as `tone` says, as a PCM stream
 * that starts once the first audio is in. The first model that answers wins;
 * a rate limit or server error moves on to the next, all within
 * PRACTICE_TTS_FIRST_AUDIO_MS.
 */
export async function streamLine(
  voice: Voice,
): Promise<SpokenLine | { ok: false; reason: TtsFailReason }> {
  const started = Date.now();
  const controller = new AbortController();
  const firstAudio = setTimeout(
    () => controller.abort(),
    PRACTICE_TTS_FIRST_AUDIO_MS,
  );
  const whole = setTimeout(() => controller.abort(), PRACTICE_TTS_STREAM_MS);
  const stop = () => {
    clearTimeout(firstAudio);
    clearTimeout(whole);
  };
  let reason: TtsFailReason = "model_error";
  for (const model of PRACTICE_TTS_MODELS) {
    let result: Attempt;
    try {
      result = await attempt(model, voice, controller.signal);
    } catch {
      result = {
        ok: false,
        reason: controller.signal.aborted ? "timeout" : "model_error",
        next: false,
      };
    }
    if (!result.ok) {
      reason = result.reason;
      if (result.next && !controller.signal.aborted) continue;
      break;
    }
    clearTimeout(firstAudio);
    const { first, rest } = result;
    const pcm = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array(first));
        if (!rest) {
          stop();
          stream.close();
        }
      },
      async pull(stream) {
        if (!rest) return;
        try {
          const next = await rest.next();
          if (next.done) {
            stop();
            stream.close();
          } else {
            stream.enqueue(new Uint8Array(next.value.pcm));
          }
        } catch {
          // Cut off mid-line (the whole-line limit, a dropped connection): what played stands.
          stop();
          stream.close();
        }
      },
      cancel() {
        stop();
        controller.abort();
      },
    });
    return {
      ok: true,
      model,
      sampleRate: result.sampleRate,
      firstAudioMs: Date.now() - started,
      pcm,
    };
  }
  stop();
  return { ok: false, reason };
}
