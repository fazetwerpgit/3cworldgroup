import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, onboardingFrom, EMAIL_TIMEOUT_MS } from './sendEmail';

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

  it('bounds the Postmark call with a timeout signal', async () => {
    await sendEmail(INPUT);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(EMAIL_TIMEOUT_MS).toBe(10_000);
  });

  it('returns ok:false with error "timeout" (never throws) when Postmark hangs past the bound', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      })
    );
    expect(await sendEmail(INPUT)).toEqual({ ok: false, error: 'timeout' });
  });

  it('passes replyTo through as Postmark ReplyTo, stripping CR/LF', async () => {
    await sendEmail({ ...INPUT, replyTo: 'sam@example.com\r\nBcc: x@evil.test' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.ReplyTo).toBe('sam@example.comBcc: x@evil.test');
    expect(body.ReplyTo).not.toMatch(/[\r\n]/);
  });

  it('omits ReplyTo when replyTo is not given', async () => {
    await sendEmail(INPUT);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('ReplyTo');
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

  it("returns Postmark's MessageID when the send is accepted", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ MessageID: 'pm-123', ErrorCode: 0 }), { status: 200 })));
    await expect(sendEmail(INPUT)).resolves.toEqual({ ok: true, messageId: 'pm-123' });
  });

  it('still reports ok when the accepted response has no readable MessageID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(sendEmail(INPUT)).resolves.toEqual({ ok: true });
  });

  it('passes tag and metadata through as Postmark Tag and Metadata, omitting them otherwise', async () => {
    await sendEmail({ ...INPUT, tag: 'onboarding-invite', metadata: { inviteId: 'inv-1' } });
    await sendEmail(INPUT);
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const tagged = JSON.parse(calls[0][1].body as string);
    expect(tagged.Tag).toBe('onboarding-invite');
    expect(tagged.Metadata).toEqual({ inviteId: 'inv-1' });
    const plain = JSON.parse(calls[1][1].body as string);
    expect(plain).not.toHaveProperty('Tag');
    expect(plain).not.toHaveProperty('Metadata');
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
