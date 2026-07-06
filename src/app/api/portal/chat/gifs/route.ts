import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedChatUser } from '@/lib/chat/access';

interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
  width?: number;
  height?: number;
}

// GIPHY returns width/height as strings; keep a dimension only when it parses to a
// finite number greater than 0, else drop it.
function parseDimension(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Map a GIPHY gif object to our slim shape. Returns null when the full-size gif url
// is missing so callers can filter it out.
function mapGiphyResult(raw: unknown): GifResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const result = raw as Record<string, unknown>;
  const images = (result.images ?? {}) as Record<string, unknown>;
  const original = (images.original ?? {}) as Record<string, unknown>;
  const fixedWidth = (images.fixed_width ?? {}) as Record<string, unknown>;
  const downsized = (images.downsized ?? {}) as Record<string, unknown>;
  const previewGif = (images.preview_gif ?? {}) as Record<string, unknown>;

  const url = typeof original.url === 'string' ? original.url : '';
  if (!url) return null;
  const previewUrl =
    (typeof fixedWidth.url === 'string' ? fixedWidth.url : undefined) ??
    (typeof downsized.url === 'string' ? downsized.url : undefined) ??
    (typeof previewGif.url === 'string' ? previewGif.url : undefined) ??
    url;

  const width = parseDimension(original.width);
  const height = parseDimension(original.height);

  return {
    id: String(result.id ?? ''),
    url,
    previewUrl,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

// GET /api/portal/chat/gifs?q=... — verified chat user only. Proxies GIPHY so the
// API key never reaches the client. Dormant (enabled:false) until GIPHY_API_KEY is
// set — same pattern as the VAPID push key.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const key = process.env.GIPHY_API_KEY;
    if (!key) {
      return NextResponse.json({ enabled: false, results: [] });
    }

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
    const params = new URLSearchParams({
      api_key: key,
      limit: '24',
      rating: 'pg-13',
      // Keep results to real GIFs (not GIPHY video Clips) since we render with <img>.
      bundle: 'messaging_non_clips',
    });
    // Empty query → trending GIFs; otherwise search.
    const base = q
      ? 'https://api.giphy.com/v1/gifs/search'
      : 'https://api.giphy.com/v1/gifs/trending';
    if (q) params.set('q', q);

    // Bound the outbound call so a slow GIPHY can't hang our request.
    const response = await fetch(`${base}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      // Upstream hiccup: stay enabled but return nothing rather than leaking details.
      return NextResponse.json({ enabled: true, results: [] });
    }

    const data = (await response.json()) as { data?: unknown };
    const results = Array.isArray(data.data)
      ? data.data.map(mapGiphyResult).filter((r): r is GifResult => r !== null)
      : [];

    return NextResponse.json({ enabled: true, results });
  } catch (error) {
    console.error('Error loading GIFs:', error);
    return NextResponse.json({ enabled: true, results: [] });
  }
}
