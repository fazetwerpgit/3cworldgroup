import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { addMock, setMock, collectionMock } = vi.hoisted(() => {
  const addMock = vi.fn();
  const setMock = vi.fn();
  const collectionMock = vi.fn((name: string) => ({
    add: addMock,
    doc: vi.fn(() => ({ set: setMock, get: vi.fn() })),
    name,
  }));
  return { addMock, setMock, collectionMock };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
}));
vi.mock('@/lib/fiberReport/parseReport', () => ({
  parseFiberReport: vi.fn(),
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.POSTMARK_INBOUND_TOKEN = 'test-token';
  addMock.mockResolvedValue({ id: 'import-1' });
  setMock.mockResolvedValue(undefined);
});

describe('POST /api/webhooks/inbound-report', () => {
  it('rejects a missing or incorrect token', async () => {
    const missing = await POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    const wrong = await POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report?token=wrong', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('logs a forwarding email without an xlsx and returns skipped', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report?token=test-token', {
        method: 'POST',
        body: JSON.stringify({ From: 'forwarder@example.com', Subject: 'Verify forwarding' }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, skipped: true });
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: 'forwarder@example.com',
        subject: 'Verify forwarding',
        error: 'no xlsx attachment',
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      { from: 'forwarder@example.com', subject: 'Verify forwarding', receivedAt: expect.any(String) },
      { merge: true }
    );
  });
});
