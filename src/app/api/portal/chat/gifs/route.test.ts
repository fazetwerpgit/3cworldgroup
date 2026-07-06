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
  delete process.env.GIPHY_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GIPHY_API_KEY;
});

describe('GET /api/portal/chat/gifs', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await GET(req('cats'));
    expect(res.status).toBe(401);
  });

  it('returns enabled:false with no results when GIPHY_API_KEY is unset', async () => {
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

  it('proxies GIPHY and maps results without leaking the key', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.GIPHY_API_KEY = 'super-secret-key';

    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'g1',
            images: {
              // GIPHY returns width/height as STRINGS.
              original: { url: 'https://media.giphy.com/g1/full.gif', width: '480', height: '270' },
              fixed_width: { url: 'https://media.giphy.com/g1/fw.gif' },
              downsized: { url: 'https://media.giphy.com/g1/down.gif' },
            },
          },
          // No original.url → filtered out.
          { id: 'g2', images: { fixed_width: { url: 'https://media.giphy.com/g2/fw.gif' } } },
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
        url: 'https://media.giphy.com/g1/full.gif',
        // fixed_width wins over downsized.
        previewUrl: 'https://media.giphy.com/g1/fw.gif',
        // String dims parsed to finite numbers.
        width: 480,
        height: 270,
      },
    ]);
    // The key travels to GIPHY but never appears in the client-facing payload.
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/v1/gifs/search');
    expect(calledUrl).toContain('api_key=super-secret-key');
    expect(JSON.stringify(json)).not.toContain('super-secret-key');
  });

  it('falls back through preview urls and drops non-positive dimensions', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.GIPHY_API_KEY = 'k';
    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'g3',
            images: {
              original: { url: 'https://media3.giphy.com/g3/full.gif', width: '0', height: 'nope' },
              preview_gif: { url: 'https://media3.giphy.com/g3/preview.gif' },
            },
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(req('dogs'));
    const json = await res.json();

    expect(json.results).toEqual([
      {
        id: 'g3',
        url: 'https://media3.giphy.com/g3/full.gif',
        previewUrl: 'https://media3.giphy.com/g3/preview.gif',
      },
    ]);
  });

  it('handles an upstream GIPHY error gracefully without leaking the key', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.GIPHY_API_KEY = 'super-secret-key';
    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'giphy exploded' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(req('cats'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ enabled: true, results: [] });
    expect(JSON.stringify(json)).not.toContain('super-secret-key');
  });

  it('uses the trending endpoint when q is empty', async () => {
    mockGate.mockResolvedValue(REP);
    process.env.GIPHY_API_KEY = 'k';
    const fetchSpy = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ data: [] }) }));
    vi.stubGlobal('fetch', fetchSpy);

    await GET(req());

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/v1/gifs/trending');
  });
});
