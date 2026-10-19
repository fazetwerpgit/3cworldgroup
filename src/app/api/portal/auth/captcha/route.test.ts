import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const request = () =>
  new Request('http://localhost/api/portal/auth/captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'tok' }),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/portal/auth/captcha', () => {
  it('fails closed in production when the secret is unset', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    const body = await (await POST(request())).json();
    expect(body.ok).toBe(false);
  });

  it('stays open outside production when the secret is unset', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect((await (await POST(request())).json()).ok).toBe(true);
  });

  it('verifies the token with Google when configured', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn(async () => Response.json({ success: true, score: 0.2, action: 'signup' }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await (await POST(request())).json()).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
