import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  docMock,
  onboardingSetMock,
  userGetMock,
  bucketMock,
  fileMock,
  saveMock,
  createNotificationMock,
  notifyDocSignedMock,
  maybeFlagActivationReadyMock,
  consoleErrorMock,
} = vi.hoisted(() => ({
  docMock: vi.fn(),
  onboardingSetMock: vi.fn(),
  userGetMock: vi.fn(),
  bucketMock: vi.fn(),
  fileMock: vi.fn(),
  saveMock: vi.fn(),
  createNotificationMock: vi.fn(),
  notifyDocSignedMock: vi.fn(),
  maybeFlagActivationReadyMock: vi.fn(),
  consoleErrorMock: vi.fn(),
}));

// Same module specifiers the webhook route test mocks, so the extracted helper
// keeps working inside that route without either test knowing about the other.
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { doc: docMock },
  adminStorage: { bucket: bucketMock },
}));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: createNotificationMock,
}));
vi.mock('@/lib/onboarding/ownerNotify', () => ({ notifyDocSigned: notifyDocSignedMock }));
vi.mock('@/lib/onboarding/activation', () => ({
  maybeFlagActivationReady: maybeFlagActivationReadyMock,
}));
vi.mock('@/types/onboarding', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', referenceKind: 'esign' },
    { id: 'onboarding_submission', label: 'Onboarding Submission', referenceKind: 'manual' },
  ],
}));

import { completeEsignItem, completedPdfPathFor } from './complete';

const PDF = Buffer.from('%PDF-signed');

const input = (overrides: Partial<Parameters<typeof completeEsignItem>[0]> = {}) => ({
  userId: 'user-1',
  itemId: 'contract',
  envelopeId: 'env_current',
  pdf: PDF,
  ...overrides,
});

const userDoc = (displayName?: string, email?: string) => ({
  get: (field: string) =>
    field === 'displayName' ? displayName : field === 'email' ? email : undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'bucket.example');
  vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
  docMock.mockImplementation((path: string) =>
    path.startsWith('users/') ? { get: userGetMock } : { set: onboardingSetMock }
  );
  onboardingSetMock.mockResolvedValue(undefined);
  userGetMock.mockResolvedValue(userDoc('Rep One', 'rep@example.com'));
  bucketMock.mockReturnValue({ file: fileMock });
  fileMock.mockReturnValue({ save: saveMock });
  saveMock.mockResolvedValue(undefined);
  createNotificationMock.mockResolvedValue('notification-1');
  notifyDocSignedMock.mockResolvedValue(undefined);
  maybeFlagActivationReadyMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('completeEsignItem', () => {
  it('approves the item before anything else can fail', async () => {
    await completeEsignItem(input());

    expect(docMock).toHaveBeenCalledWith('userOnboarding/user-1_contract');
    expect(onboardingSetMock).toHaveBeenNthCalledWith(
      1,
      {
        userId: 'user-1',
        itemId: 'contract',
        status: 'approved',
        rejectionReason: null,
        reviewedBy: 'system',
        reviewerName: 'E-sign (auto)',
        reviewedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
      { merge: true }
    );
    expect(onboardingSetMock.mock.invocationCallOrder[0]).toBeLessThan(
      saveMock.mock.invocationCallOrder[0]
    );
  });

  it('uploads the signed pdf and records its path', async () => {
    const result = await completeEsignItem(input());

    expect(bucketMock).toHaveBeenCalledWith('bucket.example');
    expect(fileMock).toHaveBeenCalledWith('esign-completed/user-1/contract.pdf');
    expect(saveMock).toHaveBeenCalledWith(PDF, {
      contentType: 'application/pdf',
      resumable: false,
    });
    expect(onboardingSetMock).toHaveBeenNthCalledWith(
      2,
      { completedPdfPath: 'esign-completed/user-1/contract.pdf' },
      { merge: true }
    );
    expect(result).toEqual({ completedPdfPath: 'esign-completed/user-1/contract.pdf' });
  });

  it('notifies the rep and the owners and re-checks activation', async () => {
    await completeEsignItem(input());

    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'esign_completed',
      title: 'Document signed',
      message: 'Contract is complete.',
      link: '/portal/onboarding',
    });
    expect(notifyDocSignedMock).toHaveBeenCalledWith({
      userId: 'user-1',
      repName: 'Rep One',
      itemLabel: 'Contract',
    });
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
  });

  it('skips the upload but still approves and notifies when there is no pdf', async () => {
    const result = await completeEsignItem(input({ pdf: null }));

    expect(saveMock).not.toHaveBeenCalled();
    expect(onboardingSetMock).toHaveBeenCalledOnce();
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(notifyDocSignedMock).toHaveBeenCalledOnce();
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ completedPdfPath: null });
  });

  it('reports a null path and keeps going when the upload fails', async () => {
    saveMock.mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await completeEsignItem(input());

    expect(result).toEqual({ completedPdfPath: null });
    expect(onboardingSetMock).toHaveBeenCalledOnce();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] completed pdf failed',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract', envelopeId: 'env_current' })
    );
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
  });

  it('reports a null path when the bucket is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', '');

    const result = await completeEsignItem(input());

    expect(bucketMock).not.toHaveBeenCalled();
    expect(result).toEqual({ completedPdfPath: null });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] completed pdf failed',
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('reports a null path when recording the uploaded path fails', async () => {
    onboardingSetMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('write failed'));

    const result = await completeEsignItem(input());

    expect(saveMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ completedPdfPath: null });
    expect(createNotificationMock).toHaveBeenCalledOnce();
  });

  it('falls back to the rep email when the users document has no display name', async () => {
    userGetMock.mockResolvedValue(userDoc(undefined, 'rep@example.com'));

    await completeEsignItem(input());

    expect(notifyDocSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ repName: 'rep@example.com' })
    );
  });

  it('falls back to the uid when the users read fails', async () => {
    userGetMock.mockRejectedValueOnce(new Error('users read failed'));

    await completeEsignItem(input());

    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] failed to resolve rep name for owner notification',
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(notifyDocSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ repName: 'user-1' })
    );
  });

  it('does not throw when the owner notification fails', async () => {
    notifyDocSignedMock.mockRejectedValueOnce(new Error('mailbox unavailable'));

    await expect(completeEsignItem(input())).resolves.toEqual({
      completedPdfPath: 'esign-completed/user-1/contract.pdf',
    });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] owner signed notification failed',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract' })
    );
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
  });

  it('does not throw when flagging activation readiness fails', async () => {
    maybeFlagActivationReadyMock.mockRejectedValueOnce(new Error('activation read failed'));

    await expect(completeEsignItem(input())).resolves.toEqual({
      completedPdfPath: 'esign-completed/user-1/contract.pdf',
    });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] failed to flag activation readiness',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract' })
    );
  });

  it('propagates a failed approval write', async () => {
    onboardingSetMock.mockRejectedValueOnce(new Error('firestore unavailable'));

    await expect(completeEsignItem(input())).rejects.toThrow('firestore unavailable');
    expect(saveMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('propagates a failed rep notification so the caller can retry', async () => {
    createNotificationMock.mockRejectedValueOnce(new Error('notifications unavailable'));

    await expect(completeEsignItem(input())).rejects.toThrow('notifications unavailable');
  });

  it('rejects an item that is not on the onboarding checklist', async () => {
    await expect(completeEsignItem(input({ itemId: 'not_an_item' }))).rejects.toThrow(
      'Unknown onboarding item: not_an_item'
    );
    expect(onboardingSetMock).not.toHaveBeenCalled();
  });

  it('throws when the database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/firebase/admin', () => ({ adminDb: null, adminStorage: null }));
    const { completeEsignItem: withoutDb } = await import('./complete');

    await expect(withoutDb(input())).rejects.toThrow('Database not configured');

    vi.doUnmock('@/lib/firebase/admin');
    vi.resetModules();
  });
});

describe('completedPdfPathFor', () => {
  it('keeps the storage layout the signed-pdf route reads', () => {
    expect(completedPdfPathFor('user-1', 'contract')).toBe('esign-completed/user-1/contract.pdf');
  });
});
