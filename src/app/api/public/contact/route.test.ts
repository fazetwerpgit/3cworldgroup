import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { addMock, sendEmailMock, ownersMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  sendEmailMock: vi.fn(),
  ownersMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ add: addMock })) },
}));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/onboarding/ownerNotify', () => ({ getOwnerRecipients: ownersMock }));

import { POST } from './route';
import { contactLimiter } from '@/lib/forms/publicLimiters';

const VALID = {
  name: 'Sam Caller',
  email: 'Sam@Example.com',
  phone: '214-555-0100',
  subject: 'services',
  message: 'Is fiber available on Elm Street?\nSecond line.',
};

function request(body: unknown, ip = '203.0.113.1') {
  return new NextRequest('http://localhost/api/public/contact', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  contactLimiter.reset();
  vi.clearAllMocks();
  addMock.mockResolvedValue({ id: 'message-1' });
  ownersMock.mockResolvedValue(['owner@3cworldgroup.com', 'second@3cworldgroup.com']);
  sendEmailMock.mockResolvedValue({ ok: true });
});

describe('POST /api/public/contact', () => {
  it('stores the message and emails every owner', async () => {
    const response = await POST(request(VALID));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, messageId: 'message-1' });
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sam Caller', email: 'sam@example.com', subject: 'services', status: 'new', source: 'website' })
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@3cworldgroup.com', subject: 'Website message: Service inquiry from Sam Caller' })
    );
    const { textBody, htmlBody } = sendEmailMock.mock.calls[0][0];
    expect(textBody).toContain('Is fiber available on Elm Street?');
    expect(htmlBody).toContain('Second line.');
  });

  it('escapes html in the message body', async () => {
    await POST(request({ ...VALID, message: '<script>alert(1)</script>' }));
    const { htmlBody } = sendEmailMock.mock.calls[0][0];
    expect(htmlBody).not.toContain('<script>');
    expect(htmlBody).toContain('&lt;script&gt;');
  });

  it('still succeeds when the email step fails, because the message is stored', async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: 'postmark down' });
    const response = await POST(request(VALID));
    expect(response.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it('swallows honeypot submissions without storing or emailing', async () => {
    const response = await POST(request({ ...VALID, website: 'http://spam' }));
    expect(response.status).toBe(200);
    expect(addMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a message with no name, bad email, or empty body', async () => {
    expect((await POST(request({ ...VALID, name: '' }))).status).toBe(400);
    expect((await POST(request({ ...VALID, email: 'nope' }))).status).toBe(400);
    expect((await POST(request({ ...VALID, message: '   ' }))).status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed email with the field message', async () => {
    for (const email of ['@', 'foo@bar', 'a b@example.com']) {
      const response = await POST(request({ ...VALID, email }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Enter a valid email address.' });
    }
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects a phone that is not a US number, but the phone stays optional', async () => {
    const response = await POST(request({ ...VALID, phone: 'not a phone' }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Enter a valid phone number.' });
    expect((await POST(request({ ...VALID, phone: '' }))).status).toBe(200);
  });

  it('answers a null or non-JSON body with 400, not 500', async () => {
    expect((await POST(request('null'))).status).toBe(400);
    expect((await POST(request('{oops'))).status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('cuts an over-long message by code point without splitting an emoji', async () => {
    await POST(request({ ...VALID, message: `${'x'.repeat(3999)}😀tail` }));
    expect(addMock.mock.calls[0][0].message).toBe(`${'x'.repeat(3999)}😀`);
  });

  it('falls back to "other" for an unknown or inherited subject key', async () => {
    await POST(request({ ...VALID, subject: 'hack' }));
    await POST(request({ ...VALID, subject: 'constructor' }));
    expect(addMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ subject: 'other' }));
    expect(addMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ subject: 'other' }));
    expect(sendEmailMock.mock.calls.at(-1)?.[0].subject).toBe('Website message: Other from Sam Caller');
  });

  it('caps messages per IP before storing or emailing', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await POST(request(VALID))).status).toBe(200);
    }

    const limited = await POST(request(VALID));

    expect(limited.status).toBe(429);
    expect(addMock).toHaveBeenCalledTimes(5);
    expect((await POST(request(VALID, '198.51.100.9'))).status).toBe(200);
  });
});
