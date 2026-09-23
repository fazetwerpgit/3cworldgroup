import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'tok') }));

import {
  INSTALL_SAVE_FAILED_MESSAGE,
  NO_SIGNAL_INSTALL_MESSAGE,
  saveInstallDate,
} from './saveInstallDate';

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('saveInstallDate', () => {
  it('PATCHes only the install date, with the token, and returns the stored date', async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true, installDate: '2026-09-29T17:00:00.000Z' }));

    const result = await saveInstallDate('s 1', '2026-09-29');

    expect(result).toEqual({ ok: true, installDate: '2026-09-29T17:00:00.000Z' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/portal/sales/s%201/install-date');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ installDate: '2026-09-29' });
  });

  it("passes the route's own line through for a bad date or a closed sale", async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Install date is before the sale date' }));
    fetchMock.mockResolvedValueOnce(reply(409, { error: 'This sale is cancelled' }));

    expect(await saveInstallDate('s1', '2026-01-01')).toEqual({ ok: false, error: 'Install date is before the sale date' });
    expect(await saveInstallDate('s1', '2026-10-01')).toEqual({ ok: false, error: 'This sale is cancelled' });
  });

  it('explains a 403 and a server failure in plain words', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: 'Forbidden: you can only change your own sales' }));
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'Failed to update install date' }));

    expect(await saveInstallDate('s1', '2026-10-01')).toEqual({ ok: false, error: 'You can only change your own sales.' });
    expect(await saveInstallDate('s1', '2026-10-01')).toEqual({ ok: false, error: INSTALL_SAVE_FAILED_MESSAGE });
  });

  it('calls a dropped connection no signal', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await saveInstallDate('s1', '2026-10-01')).toEqual({ ok: false, error: NO_SIGNAL_INSTALL_MESSAGE });
  });

  it('gives up on a hung request instead of spinning', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );

    const pending = saveInstallDate('s1', '2026-10-01', { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toEqual({ ok: false, error: NO_SIGNAL_INSTALL_MESSAGE });
  });
});
