import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

import { postBugReport } from './ReportBugCard';

const payload = { area: 'Forms', summary: 's', details: 'd', pageUrl: 'https://x/portal/settings' };

function stubFetch(body: string, status: number, contentType = 'text/html') {
  const fetchMock = vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postBugReport', () => {
  it('shows the friendly fallback when a gateway error returns HTML', async () => {
    stubFetch('<html><body>504 Gateway Timeout</body></html>', 504);
    await expect(postBugReport('tok', payload)).rejects.toThrow(/^Couldn't submit$/);
  });

  it('shows the friendly fallback for an empty error body', async () => {
    stubFetch('', 413, 'text/plain');
    await expect(postBugReport('tok', payload)).rejects.toThrow(/^Couldn't submit$/);
  });

  it('surfaces the API error message from a JSON error body', async () => {
    stubFetch(JSON.stringify({ error: 'Summary is required' }), 400, 'application/json');
    await expect(postBugReport('tok', payload)).rejects.toThrow('Summary is required');
  });

  it('resolves on success and sends the bearer token and payload', async () => {
    const fetchMock = stubFetch(JSON.stringify({ ok: true }), 200, 'application/json');
    await expect(postBugReport('tok', payload)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/portal/forms/bug-report');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });
});
