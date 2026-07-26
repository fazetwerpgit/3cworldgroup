import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  docGetMock,
  docSetMock,
  parseWebhookMock,
  createNotificationMock,
  maybeFlagActivationReadyMock,
  consoleErrorMock,
} = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
  parseWebhookMock: vi.fn(),
  createNotificationMock: vi.fn(),
  maybeFlagActivationReadyMock: vi.fn(),
  consoleErrorMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { doc: vi.fn(() => ({ get: docGetMock, set: docSetMock })) },
}));
vi.mock('@/lib/esign/provider', () => ({
  getEsignProvider: vi.fn(() => ({ parseWebhook: parseWebhookMock })),
}));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: createNotificationMock,
}));
vi.mock('@/types/onboarding', () => ({
  ONBOARDING_ITEMS: [{ id: 'contract', label: 'Contract' }],
}));
vi.mock('@/lib/onboarding/activation', () => ({
  maybeFlagActivationReady: maybeFlagActivationReadyMock,
}));

import { POST } from './route';

const completedEvent = (envelopeId: string) => ({
  envelopeId,
  status: 'completed' as const,
  metadata: { userId: 'user-1', itemId: 'contract' },
});

function webhookRequest() {
  return new NextRequest('http://localhost/api/webhooks/esign', {
    method: 'POST',
    body: '{}',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorMock.mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
  parseWebhookMock.mockResolvedValue(completedEvent('env_current'));
  docGetMock.mockResolvedValue({ get: () => 'env_current' });
  docSetMock.mockResolvedValue(undefined);
  createNotificationMock.mockResolvedValue(undefined);
  maybeFlagActivationReadyMock.mockResolvedValue(undefined);
});

describe('POST /api/webhooks/esign', () => {
  it('approves only the current envelope and clears a stale rejection reason', async () => {
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(docGetMock).toHaveBeenCalledOnce();
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', rejectionReason: null }),
      { merge: true }
    );
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
  });

  it('ignores a completed event for a superseded envelope without side effects', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_old'));
    docGetMock.mockResolvedValue({ get: () => 'env_current' });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(docSetMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign webhook] stale envelope ignored',
      expect.objectContaining({ eventEnvelopeId: 'env_old', currentEnvelopeId: 'env_current' })
    );
  });

  it('ignores a completed event when rejection removed the current envelope', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_old'));
    docGetMock.mockResolvedValue({ get: () => undefined });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(docSetMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign webhook] stale envelope ignored',
      expect.objectContaining({ eventEnvelopeId: 'env_old', currentEnvelopeId: null })
    );
  });
});
