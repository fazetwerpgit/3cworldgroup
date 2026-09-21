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

const VALID = {
  name: 'Sam Caller',
  email: 'Sam@Example.com',
  phone: '555-0100',
  subject: 'services',
  message: 'Is fiber available on Elm Street?\nSecond line.',
};

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/public/contact', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
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

  it('falls back to "other" for an unknown subject', async () => {
    await POST(request({ ...VALID, subject: 'hack' }));
    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({ subject: 'other' }));
  });
});
