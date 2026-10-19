// Design-lab harness: mock only the announcements API, pass every other request
// through to the real fetch, and hand back a restore function for unmount.

const LIST = {
  nextSendDate: '2026-09-24',
  announcements: [
    { id: '1', title: 'New: log a sale from a screenshot', body: 'Snap the order confirmation and the form fills itself. Check the details, then submit.', sendAt: '2026-09-24T13:00:00Z', status: 'scheduled', createdBy: 'o', createdAt: '2026-09-23T20:00:00Z', sentAt: null, sentCount: 0, failedCount: 0 },
    { id: '2', title: 'Leaderboard reset', body: 'Monthly board starts over today.', sendAt: '2026-09-01T13:00:00Z', status: 'sent', createdBy: 'o', createdAt: '2026-08-31T20:00:00Z', sentAt: '2026-09-01T13:04:00Z', sentCount: 47, failedCount: 3 },
    { id: '3', title: 'Team call moved', body: 'Friday call is at 10 AM this week.', sendAt: '2026-08-20T13:00:00Z', status: 'cancelled', createdBy: 'o', createdAt: '2026-08-19T20:00:00Z', sentAt: null, sentCount: 0, failedCount: 0 },
  ],
};

const API_PREFIX = '/api/portal/announcements';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Mock JSON for an announcements API URL, or null when the URL is not one. */
export function mockAnnouncementJson(input: RequestInfo | URL): unknown | null {
  const raw = requestUrl(input);
  let path: string;
  try {
    path = new URL(raw, 'http://localhost').pathname;
  } catch {
    return null;
  }
  if (path !== API_PREFIX && !path.startsWith(`${API_PREFIX}/`)) return null;
  if (path.endsWith('/recipients')) return { count: 47 };
  if (path.endsWith('/send-now')) return { id: 'x', sentCount: 46, failedCount: 1 };
  if (path.endsWith('/test')) return { devices: 2, delivered: 2 };
  if (path.endsWith('/cancel')) return { ok: true };
  return LIST;
}

type FetchHost = { fetch: typeof fetch };

/** Install the mock on `host` (window). Returns a function that restores the original fetch. */
export function installAnnouncementFetchMock(host: FetchHost): () => void {
  const original = host.fetch;
  const mocked: typeof fetch = async (input, init) => {
    const json = mockAnnouncementJson(input);
    if (json === null) return original.call(host, input, init);
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  host.fetch = mocked;
  return () => {
    if (host.fetch === mocked) host.fetch = original;
  };
}
