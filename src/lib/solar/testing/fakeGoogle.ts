// A stand-in for Google's OAuth and Calendar REST endpoints, installed as the
// global fetch in tests. Each knob picks how Google answers; every request is
// recorded (method, URL, parsed body) for the assertions. Tests only.
import { vi } from 'vitest';

export interface GoogleRequest {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
  auth: string;
}

export interface FakeGoogle {
  requests: GoogleRequest[];
  /** Answer to grant_type=refresh_token. */
  refresh: 'ok' | 'invalid_grant' | 'error';
  /** Answer to grant_type=authorization_code. */
  exchange: { status: number; body: Record<string, unknown> };
  /** events.insert. */
  /** 'hang': never answers until the request is aborted (our budget or timeout). */
  insert: 'ok' | 'conflict' | 'error' | 'timeout' | 'hang';
  /** The Meet link an insert with conferenceData answers. */
  meetLink: string;
  /** freeBusy: busy intervals, or 'error'. */
  freeBusy: { start: string; end: string }[] | 'error';
  /** events.delete status. */
  deleteStatus: number;
  find: (method: string, pattern: string | RegExp) => GoogleRequest | undefined;
  all: (method: string, pattern: string | RegExp) => GoogleRequest[];
  fetch: ReturnType<typeof vi.fn>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function bodyOf(init?: RequestInit): Record<string, unknown> | null {
  if (!init?.body) return null;
  const raw = String(init.body);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

export function createFakeGoogle(): FakeGoogle {
  const g: FakeGoogle = {
    requests: [],
    refresh: 'ok',
    exchange: { status: 200, body: {} },
    insert: 'ok',
    meetLink: 'https://meet.google.com/new-meet-abc',
    freeBusy: [],
    deleteStatus: 204,
    find: (method, pattern) => g.all(method, pattern)[0],
    all: (method, pattern) =>
      g.requests.filter(
        (r) => r.method === method && (typeof pattern === 'string' ? r.url.includes(pattern) : pattern.test(r.url))
      ),
    fetch: vi.fn(),
  };
  const events = new Map<string, Record<string, unknown>>();

  g.fetch.mockImplementation(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = bodyOf(init);
    const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
    g.requests.push({ method, url, body, auth });

    if (url === 'https://oauth2.googleapis.com/token') {
      if (body?.grant_type === 'refresh_token') {
        if (g.refresh === 'ok') return json(200, { access_token: 'access-1', expires_in: 3599, token_type: 'Bearer' });
        if (g.refresh === 'invalid_grant') return json(400, { error: 'invalid_grant' });
        return json(500, { error: 'internal_failure' });
      }
      return json(g.exchange.status, g.exchange.body);
    }
    if (url === 'https://oauth2.googleapis.com/revoke') return json(200, {});

    if (url.startsWith('https://www.googleapis.com/calendar/v3/freeBusy')) {
      if (g.freeBusy === 'error') return json(500, { error: { status: 'INTERNAL' } });
      return json(200, { calendars: { primary: { busy: g.freeBusy } } });
    }

    const eventMatch = /calendars\/primary\/events(?:\/([^?]+))?/.exec(url);
    if (eventMatch) {
      const id = eventMatch[1] ? decodeURIComponent(eventMatch[1]) : '';
      if (method === 'POST') {
        if (g.insert === 'hang') {
          await new Promise((_, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          });
        }
        if (g.insert === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
        if (g.insert === 'error') return json(500, { error: { status: 'INTERNAL' } });
        if (g.insert === 'conflict' || events.has(String(body?.id))) {
          if (!events.has(String(body?.id))) events.set(String(body?.id), { id: body?.id, hangoutLink: g.meetLink, status: 'confirmed' });
          return json(409, { error: { status: 'ALREADY_EXISTS' } });
        }
        const event = { ...body, status: 'confirmed', ...(body?.conferenceData ? { hangoutLink: g.meetLink } : {}) };
        events.set(String(body?.id), event);
        return json(200, event);
      }
      if (method === 'GET') return events.has(id) ? json(200, events.get(id)) : json(404, { error: { status: 'NOT_FOUND' } });
      if (method === 'DELETE') {
        events.delete(id);
        return new Response(null, { status: g.deleteStatus });
      }
      if (method === 'PATCH') return json(200, { ...(events.get(id) ?? { id }), ...body });
    }
    return json(404, { error: 'not mocked' });
  });
  return g;
}
