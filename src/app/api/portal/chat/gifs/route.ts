import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedChatUser } from '@/lib/chat/access';

interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
  width?: number;
  height?: number;
}

// Map a Tenor v2 result object to our slim shape. Returns null when the full-size
// gif format is missing so callers can filter it out.
function mapTenorResult(raw: unknown): GifResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const result = raw as Record<string, unknown>;
  const formats = (result.media_formats ?? {}) as Record<string, unknown>;
  const gif = (formats.gif ?? {}) as Record<string, unknown>;
  const tiny = (formats.tinygif ?? {}) as Record<string, unknown>;

  const url = typeof gif.url === 'string' ? gif.url : '';
  if (!url) return null;
  const previewUrl = typeof tiny.url === 'string' ? tiny.url : url;

  const dims = Array.isArray(gif.dims) ? gif.dims : [];
  const width = typeof dims[0] === 'number' ? dims[0] : undefined;
  const height = typeof dims[1] === 'number' ? dims[1] : undefined;

  return {
    id: typeof result.id === 'string' ? result.id : String(result.id ?? ''),
    url,
    previewUrl,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

// GET /api/portal/chat/gifs?q=... — verified chat user only. Proxies Tenor so the
// API key never reaches the client. Dormant (enabled:false) until TENOR_API_KEY is
// set — same pattern as the VAPID push key.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const key = process.env.TENOR_API_KEY;
    if (!key) {
      return NextResponse.json({ enabled: false, results: [] });
    }

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
    const params = new URLSearchParams({
      key,
      limit: '24',
      media_filter: 'gif,tinygif',
      contentfilter: 'medium',
    });
    // Empty query → featured GIFs; otherwise search.
    const base = q
      ? 'https://tenor.googleapis.com/v2/search'
      : 'https://tenor.googleapis.com/v2/featured';
    if (q) params.set('q', q);

    // Bound the outbound call so a slow Tenor can't hang our request.
    const response = await fetch(`${base}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      // Upstream hiccup: stay enabled but return nothing rather than leaking details.
      return NextResponse.json({ enabled: true, results: [] });
    }

    const data = (await response.json()) as { results?: unknown };
    const results = Array.isArray(data.results)
      ? data.results.map(mapTenorResult).filter((r): r is GifResult => r !== null)
      : [];

    return NextResponse.json({ enabled: true, results });
  } catch (error) {
    console.error('Error loading GIFs:', error);
    return NextResponse.json({ enabled: true, results: [] });
  }
}
