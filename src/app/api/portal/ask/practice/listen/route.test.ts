import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { LISTEN_MODEL } from '@/lib/ask/practiceHandsFree';

// POST /api/portal/ask/practice/listen: a hands-free token, locked to live
// transcription, never the API key. fetch is stubbed.

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
const req = () => new NextRequest('http://localhost/api/portal/ask/practice/listen', { method: 'POST', headers: { authorization: 'Bearer t' } });

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'secret-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: 'auth_tokens/abc' }), { status: 200 }));
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Ana', email: '', isOwner: false });
  state.db = createFakeAskDb({}).db;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/portal/ask/practice/listen', () => {
  it('404s a rep in "owners" mode, without minting', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    expect((await POST(req())).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints a one-use token locked to live transcription, and hands over only the token', async () => {
    const res = await POST(req());
    const body = await res.json();
    expect(body.token).toBe('auth_tokens/abc');
    expect(body.url).toMatch(/^wss:\/\/generativelanguage\.googleapis\.com\/.*BidiGenerateContentConstrained$/);
    expect(JSON.stringify(body)).not.toContain('secret-key');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    const sent = JSON.parse(init.body);
    expect(sent.uses).toBe(1);
    expect(sent.bidiGenerateContentSetup).toMatchObject({
      model: `models/${LISTEN_MODEL}`,
      generationConfig: { responseModalities: ['TEXT'] },
      inputAudioTranscription: { languageCodes: ['en-US'] },
    });
    expect(Date.parse(sent.newSessionExpireTime) - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('stops at the daily limit, and says so when Google refuses', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    expect((await POST(req())).status).toBe(502);
    for (let i = 1; i < 60; i += 1) await POST(req());
    expect((await POST(req())).status).toBe(429);
  });
});
