import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  docGetMock,
  docSetMock,
  parseWebhookMock,
  createNotificationMock,
  maybeFlagActivationReadyMock,
  createAlertTaskMock,
  consoleErrorMock,
  consoleWarnMock,
} = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
  parseWebhookMock: vi.fn(),
  createNotificationMock: vi.fn(),
  maybeFlagActivationReadyMock: vi.fn(),
  createAlertTaskMock: vi.fn(),
  consoleErrorMock: vi.fn(),
  consoleWarnMock: vi.fn(),
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
vi.mock('@/lib/alerts/alertTasks', () => ({ createAlertTask: createAlertTaskMock }));
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

const onboardingDoc = (envelopeId: string | undefined, supersededEnvelopeIds: string[] = []) => ({
  get: (field: string) =>
    field === 'esignEnvelopeId'
      ? envelopeId
      : field === 'supersededEnvelopeIds'
        ? supersededEnvelopeIds
        : undefined,
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
  vi.spyOn(console, 'warn').mockImplementation(consoleWarnMock);
  parseWebhookMock.mockResolvedValue(completedEvent('env_current'));
  docGetMock.mockResolvedValue(onboardingDoc('env_current'));
  docSetMock.mockResolvedValue(undefined);
  createNotificationMock.mockResolvedValue(undefined);
  maybeFlagActivationReadyMock.mockResolvedValue(undefined);
  createAlertTaskMock.mockResolvedValue('alert_1');
});

afterEach(() => {
  vi.restoreAllMocks();
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
    docGetMock.mockResolvedValue(onboardingDoc('env_current', ['env_old']));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(docSetMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).toHaveBeenCalledWith(
      '[esign webhook] superseded envelope ignored',
      expect.objectContaining({ eventEnvelopeId: 'env_old', currentEnvelopeId: 'env_current' })
    );
    expect(consoleErrorMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('raises one deduplicated ops alert for an unknown envelope mismatch', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_unknown'));
    docGetMock.mockResolvedValue(onboardingDoc('env_current', ['env_old']));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(docSetMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign webhook] unknown envelope mismatch',
      expect.objectContaining({ eventEnvelopeId: 'env_unknown', currentEnvelopeId: 'env_current' })
    );
    expect(createAlertTaskMock).toHaveBeenCalledOnce();
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      // Must NOT be review_needed: alert tasks dedupe on (kind, subjectUserId)
      // and a successful dispatch resolves every open review_needed for the rep,
      // either of which would make this alert disappear.
      expect.objectContaining({ kind: 'esign_mismatch', subjectUserId: 'user-1' })
    );
  });

  it('keeps the webhook successful when raising the mismatch alert fails', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_unknown'));
    docGetMock.mockResolvedValue(onboardingDoc('env_current'));
    createAlertTaskMock.mockRejectedValueOnce(new Error('alert database unavailable'));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign webhook] failed to raise envelope mismatch alert',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract' })
    );
  });

  it('quietly ignores an old envelope when rejection cleared the current envelope', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_old'));
    docGetMock.mockResolvedValue(onboardingDoc(undefined, ['env_old']));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(docSetMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).toHaveBeenCalledWith(
      '[esign webhook] superseded envelope ignored',
      expect.objectContaining({ eventEnvelopeId: 'env_old', currentEnvelopeId: null })
    );
    expect(consoleErrorMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });
});
