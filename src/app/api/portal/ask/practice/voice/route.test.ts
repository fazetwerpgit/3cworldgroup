import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { practiceCustomer } from '@/lib/ask/practice';
import { pcmToWav } from '@/lib/ask/practiceTts';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// POST /api/portal/ask/practice/voice: only the caller's own session, only its
// latest homeowner line, in the session's voice; a WAV around Gemini's PCM.
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
const SAVED = { uid: 'r1', sessionId: 's1', persona: 'busy-parent', seed: 42, patience: 3, lastLine: LINE };
const PCM = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/ask/practice/voice', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function geminiSpeaks() {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: PCM.toString('base64') } }] } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
}

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
  it("speaks the session's latest homeowner line in its voice and style, as a WAV", async () => {
    geminiSpeaks();
    const res = await POST(req({ sessionId: 's1', text: LINE }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(pcmToWav(PCM, 24_000));

    const customer = practiceCustomer('busy-parent', 42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('gemini-2.5-flash-preview-tts:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('gem-key');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toBe(`${customer.style}: ${LINE}`);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(customer.ttsVoice);
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
    fetchMock.mockResolvedValueOnce(new Response('overloaded', { status: 503 }));
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(502);
    fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(504);
    vi.stubEnv('GEMINI_API_KEY', '');
    expect((await POST(req({ sessionId: 's1', text: LINE }))).status).toBe(503);
  });
});

describe('pcmToWav', () => {
  it('writes a 44-byte PCM header with the right sizes and rates', () => {
    const wav = pcmToWav(Buffer.alloc(4800), 24_000);
    expect(wav.length).toBe(44 + 4800);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + 4800);
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(28)).toBe(48_000);
    expect(wav.readUInt16LE(32)).toBe(2);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(4800);
  });
});
