import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, onboardingFrom } from './sendEmail';

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

  it('uses the from override when provided', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'tok');
    vi.stubEnv('EMAIL_FROM', 'notifications@example.com');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail({ to: 'a@b.c', subject: 's', htmlBody: '<p>h</p>', textBody: 't', from: 'onboarding@3cworldgroup.com' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.From).toBe('onboarding@3cworldgroup.com');
  });

  it('falls back to EMAIL_FROM when from is undefined', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'tok');
    vi.stubEnv('EMAIL_FROM', 'notifications@example.com');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail({ to: 'a@b.c', subject: 's', htmlBody: '<p>h</p>', textBody: 't', from: undefined });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.From).toBe('notifications@example.com');
  });

  it('serializes attachments for Postmark', async () => {
    await sendEmail({
      ...INPUT,
      attachments: [{
        name: 'contract.pdf',
        contentBase64: 'JVBERi0x',
        contentType: 'application/pdf',
      }],
    });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).Attachments).toEqual([{
      Name: 'contract.pdf',
      Content: 'JVBERi0x',
      ContentType: 'application/pdf',
    }]);
  });

  it('omits Postmark attachments when none are provided', async () => {
    await sendEmail(INPUT);

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('Attachments');
  });

  describe('onboardingFrom', () => {
    it('returns the env value when set', () => {
      vi.stubEnv('ONBOARDING_EMAIL_FROM', 'onboarding@3cworldgroup.com');
      expect(onboardingFrom()).toBe('onboarding@3cworldgroup.com');
    });
    it('returns undefined when unset or empty', () => {
      vi.stubEnv('ONBOARDING_EMAIL_FROM', '');
      expect(onboardingFrom()).toBeUndefined();
    });
  });
});
