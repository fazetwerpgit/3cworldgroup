import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  docGetMock,
  docSetMock,
  userDocGetMock,
  parseWebhookMock,
  createNotificationMock,
  notifyDocSignedMock,
  getCompletedPdfMock,
  storageSaveMock,
  maybeFlagActivationReadyMock,
  createAlertTaskMock,
  consoleErrorMock,
  consoleWarnMock,
} = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
  userDocGetMock: vi.fn(),
  parseWebhookMock: vi.fn(),
  createNotificationMock: vi.fn(),
  notifyDocSignedMock: vi.fn(),
  getCompletedPdfMock: vi.fn(),
  storageSaveMock: vi.fn(),
  maybeFlagActivationReadyMock: vi.fn(),
  createAlertTaskMock: vi.fn(),
  consoleErrorMock: vi.fn(),
  consoleWarnMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    doc: vi.fn((path: string) =>
      path.startsWith('users/')
        ? { get: userDocGetMock }
        : { get: docGetMock, set: docSetMock }
    ),
  },
  adminStorage: {
    bucket: vi.fn(() => ({ file: vi.fn(() => ({ save: storageSaveMock })) })),
  },
}));
vi.mock('@/lib/esign/provider', () => ({
  getEsignProvider: vi.fn(() => ({ parseWebhook: parseWebhookMock, getCompletedPdf: getCompletedPdfMock })),
}));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: createNotificationMock,
}));
vi.mock('@/lib/alerts/alertTasks', () => ({ createAlertTask: createAlertTaskMock }));
vi.mock('@/types/onboarding', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', referenceKind: 'esign' },
    { id: 'onboarding_submission', label: 'Onboarding Submission', referenceKind: 'manual' },
  ],
}));
vi.mock('@/lib/onboarding/activation', () => ({
  maybeFlagActivationReady: maybeFlagActivationReadyMock,
}));
vi.mock('@/lib/onboarding/ownerNotify', () => ({ notifyDocSigned: notifyDocSignedMock }));

import { POST } from './route';

const completedEvent = (envelopeId: string, itemId = 'contract') => ({
  envelopeId,
  status: 'completed' as const,
  metadata: { userId: 'user-1', itemId },
});

const onboardingDoc = (envelopeId: string | undefined, supersededEnvelopeIds: string[] = []) => ({
  get: (field: string) =>
    field === 'esignEnvelopeId'
      ? envelopeId
      : field === 'supersededEnvelopeIds'
        ? supersededEnvelopeIds
        : undefined,
});

const userDoc = (displayName?: string, email?: string) => ({
  get: (field: string) =>
    field === 'displayName' ? displayName : field === 'email' ? email : undefined,
});

function webhookRequest() {
  return new NextRequest('http://localhost/api/webhooks/esign', {
    method: 'POST',
    body: '{}',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'bucket.example');
  consoleErrorMock.mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
  vi.spyOn(console, 'warn').mockImplementation(consoleWarnMock);
  parseWebhookMock.mockResolvedValue(completedEvent('env_current'));
  docGetMock.mockResolvedValue(onboardingDoc('env_current'));
  userDocGetMock.mockResolvedValue(userDoc('Rep One', 'rep@example.com'));
  docSetMock.mockResolvedValue(undefined);
  getCompletedPdfMock.mockResolvedValue(Buffer.from('%PDF-complete'));
  storageSaveMock.mockResolvedValue(undefined);
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
    expect(storageSaveMock).toHaveBeenCalledWith(Buffer.from('%PDF-complete'), expect.objectContaining({
      contentType: 'application/pdf',
    }));
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ completedPdfPath: 'esign-completed/user-1/contract.pdf' }),
      { merge: true }
    );
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(notifyDocSignedMock).toHaveBeenCalledWith({
      userId: 'user-1', repName: 'Rep One', itemLabel: 'Contract',
    });
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

  it('raises one ops alert for an unknown envelope mismatch', async () => {
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
      expect.objectContaining({
        kind: 'esign_mismatch',
        subjectUserId: 'user-1',
        subjectName: 'Rep One',
        message: expect.stringContaining('env_unknown'),
      })
    );
  });

  it('uses the rep email when the users document has no display name', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_unknown'));
    docGetMock.mockResolvedValue(onboardingDoc('env_current'));
    userDocGetMock.mockResolvedValue(userDoc(undefined, 'rep@example.com'));

    await POST(webhookRequest());

    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ subjectName: 'rep@example.com' })
    );
  });

  it('falls back to the uid and still raises the alert when the users read fails', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_unknown'));
    docGetMock.mockResolvedValue(onboardingDoc('env_current'));
    userDocGetMock.mockRejectedValueOnce(new Error('users read failed'));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ subjectName: 'user-1' })
    );
    expect(createAlertTaskMock).toHaveBeenCalledOnce();
  });

  it('ignores a completed event naming a non-e-sign item without reading or alerting', async () => {
    parseWebhookMock.mockResolvedValue(completedEvent('env_unknown', 'onboarding_submission'));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(docGetMock).not.toHaveBeenCalled();
    expect(userDocGetMock).not.toHaveBeenCalled();
    expect(docSetMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign webhook] completed event is not an e-sign item',
      { envelopeId: 'env_unknown', itemId: 'onboarding_submission' }
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

  it('still approves and returns 200 when completed PDF storage fails', async () => {
    getCompletedPdfMock.mockRejectedValueOnce(new Error('SignWell unavailable'));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
      { merge: true }
    );
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(notifyDocSignedMock).toHaveBeenCalledOnce();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign webhook] completed pdf failed',
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
