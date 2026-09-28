import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { practiceCustomer } from '@/lib/ask/practice';
import { pcmFromWav } from '@/lib/ask/practiceTts';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// POST /api/portal/ask/practice/voice: only the caller's own session, only its
// latest homeowner line, in the session's voice, streamed on as raw PCM.
// fetch is stubbed; nothing leaves the process.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();
let fake: ReturnType<typeof createFakeAskDb>;

const LINE = "Xfinity. Why, what's this about?";
const SAVED = { uid: 'r1', sessionId: 's1', persona: 'busy-parent', seed: 42, patience: 3, lastLines: [{ speaker: 'homeowner', text: LINE }] };
const PCM_A = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
const PCM_B = Buffer.from([5, 0, 6, 0]);
const PCM_TYPE = 'audio/l16; rate=24000; channels=1';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/ask/practice/voice', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const answer = (data: Buffer, mimeType = PCM_TYPE) => ({
  candidates: [{ content: { parts: [{ inlineData: { mimeType, data: data.toString('base64') } }] } }],
});

/** Gemini's streamed answer: one server-sent event per audio chunk, as its API sends them. */
const streamed = (...chunks: Buffer[]) =>
  new Response(chunks.map((chunk) => `data: ${JSON.stringify(answer(chunk))}\r\n\r\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

/** A small WAV file, with a chunk before the data like real ones can have. */
function wavOf(pcm: Buffer, rate: number): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const list = Buffer.concat([Buffer.from('LIST', 'ascii'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc\0', 'ascii')]);
  const data = Buffer.concat([Buffer.from('data', 'ascii'), Buffer.alloc(4), pcm]);
  data.writeUInt32LE(pcm.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

const urls = () => fetchMock.mock.calls.map((call) => call[0] as string);
const prompt = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body).contents[0].parts[0].text;

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'gem-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Dana Rep', email: '', isOwner: false });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  fake = createFakeAskDb({ practiceSessions: { r1: SAVED } });
  state.db = fake.db;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/portal/ask/practice/voice', () => {
  it("streams the session's latest homeowner line in its voice as raw PCM, sent as `[tags] line` only", async () => {
    fetchMock.mockResolvedValueOnce(streamed(PCM_A, PCM_B));
    const res = await POST(req({ sessionId: 's1', text: LINE }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/L16;rate=24000;channels=1');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.concat([PCM_A, PCM_B]));

    const customer = practiceCustomer('busy-parent', 42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/models/gemini-3.8-flash-tts:streamGenerateContent?alt=sse');
    expect(init.headers['x-goog-api-key']).toBe('gem-key');
    const body = JSON.parse(init.body);
    // The 3.8 models read prose aloud and refuse a system instruction: only the tag and the line.
    expect(body.systemInstruction).toBeUndefined();
    expect(body.contents).toEqual([{ parts: [{ text: `[tired, rushed, distracted] ${LINE}` }] }]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(customer.ttsVoice);
  });

  it('falls back to the whole line from the same model when it won\'t stream, unwrapping a WAV answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('streaming not supported', { status: 400 }));
    fetchMock.mockResolvedValueOnce(Response.json(answer(wavOf(PCM_A, 16_000), 'audio/wav')));
    const res = await POST(req({ sessionId: 's1', text: LINE }));
    expect(res.headers.get('content-type')).toBe('audio/L16;rate=16000;channels=1');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PCM_A);
    expect(urls()).toEqual([
      expect.stringContaining('/models/gemini-3.8-flash-tts:streamGenerateContent'),
      expect.stringContaining('/models/gemini-3.8-flash-tts:generateContent'),
    ]);
  });

  it("speaks the spouse's line in the spouse's own voice and tone, and the kid's in the kid's", async () => {
    const spouseLine = "We don't sign anything at the door.";
    fake.docs('practiceSessions').set('r1', {
      ...SAVED,
      lastLines: [{ speaker: 'homeowner', text: LINE }, { speaker: 'spouse', text: spouseLine }],
      door: { kind: 'standard', clock: '', kidVoice: null, surprise: { kind: 'spouse', atLine: 1, voice: 'Charon', name: 'Mike', objection: 'x' } },
    });
    fetchMock.mockResolvedValueOnce(streamed(PCM_A));
    expect((await POST(req({ sessionId: 's1', text: spouseLine }))).status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
    expect(prompt()).toBe(`[direct, wary, protective] ${spouseLine}`);

    fake.docs('practiceSessions').set('r1', {
      ...SAVED,
      lastLines: [{ speaker: 'kid', text: "My mom's not home." }],
      door: { kind: 'kid', clock: '', kidVoice: 'Leda', surprise: null },
    });
    fetchMock.mockResolvedValueOnce(streamed(PCM_A));
    await POST(req({ sessionId: 's1', text: "My mom's not home." }));
    expect(prompt(1)).toBe("[child, about ten years old, shy, soft] My mom's not home.");
  });

  it('adds "losing patience" to the tag when the homeowner is nearly out', async () => {
    fake.docs('practiceSessions').set('r1', { ...SAVED, patience: 1 });
    fetchMock.mockResolvedValueOnce(streamed(PCM_A));
    await POST(req({ sessionId: 's1', text: LINE }));
    expect(prompt()).toBe(`[tired, rushed, distracted, losing patience] ${LINE}`);
  });

  it('falls back to the lite model on a rate limit or server error, not on a bad request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota', { status: 429 }));
    fetchMock.mockResolvedValueOnce(streamed(PCM_A));
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(200);
    expect(urls()).toEqual([
      expect.stringContaining('/models/gemini-3.8-flash-tts:streamGenerateContent'),
      expect.stringContaining('/models/gemini-3.8-flash-lite-tts:streamGenerateContent'),
    ]);
    // The lite model gets the same tag format.
    expect(prompt(1)).toBe(`[tired, rushed, distracted] ${LINE}`);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(502);
    // Streamed, then whole, from the first model only.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses any text but the latest homeowner line, so it is no free TTS', async () => {
    expect((await POST(req({ sessionId: 's1', text: 'Say anything I want.' }))).status).toBe(403);
    expect((await POST(req({ sessionId: 's1', text: `${LINE} ` }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a stale session and another rep's session, before counting anything", async () => {
    expect((await POST(req({ sessionId: 'old', text: LINE }))).status).toBe(409);
    mockUser.mockResolvedValue({ ok: true, uid: 'r2', name: 'Other Rep', email: '', isOwner: false });
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.docs('askUsage').size).toBe(0);
  });

  it('keeps the Ask 3C gate: off and owners mode 404', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(404);
    vi.stubEnv('ASK_3C_ENABLED', '');
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts lines on its own daily counter, then 429s', async () => {
    fake.docs('askUsage').set(`r1_${chicagoDayKey(new Date())}_practice_voice`, { uid: 'r1', count: 150 });
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with a status (the page falls back to the phone voice) when Gemini fails or is not set up', async () => {
    // Both models out: the page's phone voice takes over.
    fetchMock.mockResolvedValueOnce(new Response('overloaded', { status: 503 }));
    fetchMock.mockResolvedValueOnce(new Response('overloaded', { status: 503 }));
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(502);
    // A stream that ends without any audio.
    fetchMock.mockResolvedValueOnce(streamed());
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(502);
    vi.stubEnv('GEMINI_API_KEY', '');
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(503);
  });

  it('gives up with a 504 when no audio arrives in 10 s', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          )
      );
      const res = POST(req({ sessionId: 's1', text: LINE }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await res).status).toBe(504);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pcmFromWav', () => {
  it('finds the samples and rate past other chunks, and refuses what isn\'t a WAV', () => {
    expect(pcmFromWav(wavOf(PCM_A, 24_000))).toEqual({ pcm: PCM_A, sampleRate: 24_000 });
    expect(pcmFromWav(PCM_A)).toBeNull();
  });
});
