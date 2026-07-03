import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));

import { GET } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

const REP = {
  ok: true as const,
  user: {
    uid: 'rep-1',
    displayName: 'Rep One',
    role: undefined,
    fieldRole: 'entry_rep' as const,
    effectiveRole: 'entry_rep' as const,
    canModerate: false,
  },
};

function req(q?: string) {
  const url = q
    ? `http://localhost/api/portal/chat/gifs?q=${encodeURIComponent(q)}`
    : 'http://localhost/api/portal/chat/gifs';
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  mockGate.mockReset();
  delete process.env.TENOR_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TENOR_API_KEY;
});

describe('GET /api/portal/chat/gifs', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await GET(req('cats'));
    expect(res.status).toBe(401);
  });

  it('returns enabled:false with no results when TENOR_API_KEY is unset', async () => {
    mockGate.mockResolvedValue(REP);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(req('cats'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ enabled: false, results: [] });
    // Never calls upstream when dormant.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('proxies Tenor and maps results without leaking the key', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.TENOR_API_KEY = 'super-secret-key';

    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'g1',
            media_formats: {
              gif: { url: 'https://media.tenor.com/g1/full.gif', dims: [480, 270] },
              tinygif: { url: 'https://media.tenor.com/g1/tiny.gif' },
            },
          },
          // No gif format → filtered out.
          { id: 'g2', media_formats: { tinygif: { url: 'https://media.tenor.com/g2/tiny.gif' } } },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(req('cats'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.enabled).toBe(true);
    expect(json.results).toEqual([
      {
        id: 'g1',
        url: 'https://media.tenor.com/g1/full.gif',
        previewUrl: 'https://media.tenor.com/g1/tiny.gif',
        width: 480,
        height: 270,
      },
    ]);
    // The key travels to Tenor but never appears in the client-facing payload.
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('key=super-secret-key');
    expect(JSON.stringify(json)).not.toContain('super-secret-key');
  });

  it('handles an upstream Tenor error gracefully without leaking the key', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.TENOR_API_KEY = 'super-secret-key';
    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'tenor exploded' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(req('cats'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ enabled: true, results: [] });
    expect(JSON.stringify(json)).not.toContain('super-secret-key');
  });

  it('uses the featured endpoint when q is empty', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.TENOR_API_KEY = 'k';
    const fetchSpy = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ results: [] }) }));
    vi.stubGlobal('fetch', fetchSpy);

    await GET(req());

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/v2/featured');
  });
});
