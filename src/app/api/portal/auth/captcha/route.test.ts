import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { verifyCaptchaPass } from '@/lib/auth/captchaPass';

const request = (body: Record<string, unknown> = { token: 'tok' }) =>
  new Request('http://localhost/api/portal/auth/captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

  it('issues a pass bound to the signup email that signup-notify can verify', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, score: 0.9, action: 'signup' })));
    const body = await (await POST(request({ token: 'tok', email: ' sam@x.com ' }))).json();
    expect(body.ok).toBe(true);
    expect(verifyCaptchaPass(body.pass, 'sam@x.com', 'secret')).toBe(true);
    expect(verifyCaptchaPass(body.pass, 'other@x.com', 'secret')).toBe(false);
  });

  it('issues no pass when Google rejects the token', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'secret');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false })));
    const body = await (await POST(request({ token: 'tok', email: 'sam@x.com' }))).json();
    expect(body).toEqual({ ok: false });
  });
});
