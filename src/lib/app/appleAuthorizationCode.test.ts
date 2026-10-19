import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAppleAuthorizationCode } from './appleAuthorizationCode';

const user = { getIdToken: vi.fn(async () => 'id-token') };

afterEach(() => vi.restoreAllMocks());

describe('sendAppleAuthorizationCode', () => {
  it('posts the code with the ID token', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await sendAppleAuthorizationCode(user, 'code-abc', fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/portal/auth/apple-token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    expect(JSON.parse(String(init.body))).toEqual({ authorizationCode: 'code-abc' });
  });

  it('does nothing without a code (older app) or a user', async () => {
    const fetchImpl = vi.fn();
    expect(await sendAppleAuthorizationCode(user, undefined, fetchImpl as unknown as typeof fetch)).toBe(false);
    expect(await sendAppleAuthorizationCode(null, 'c', fetchImpl as unknown as typeof fetch)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws on a network error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await sendAppleAuthorizationCode(user, 'c', fetchImpl as unknown as typeof fetch)).toBe(false);
  });
});
