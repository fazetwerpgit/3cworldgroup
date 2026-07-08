import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from './sendEmail';

const INPUT = { to: 'a@b.c', subject: 's', htmlBody: '<p>h</p>', textBody: 't' };

describe('sendEmail', () => {
  beforeEach(() => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'tok');
    vi.stubEnv('EMAIL_FROM', 'portal@example.com');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts to Postmark with the server token header', async () => {
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(true);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect((init.headers as Record<string, string>)['X-Postmark-Server-Token']).toBe('tok');
    const body = JSON.parse(init.body as string);
    expect(body.From).toBe('portal@example.com');
    expect(body.To).toBe('a@b.c');
  });

  it('returns ok:false (never throws) when unconfigured', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns ok:false on non-2xx without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 422 })));
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(false);
  });
});
