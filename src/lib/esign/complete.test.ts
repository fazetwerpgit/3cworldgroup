import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  docMock,
  onboardingSetMock,
  itemGetMock,
  runTransactionMock,
  userGetMock,
  bucketMock,
  fileMock,
  saveMock,
  createNotificationMock,
  notifyDocSignedMock,
  maybeFlagActivationReadyMock,
  resolveSigningAlertTasksMock,
  consoleErrorMock,
} = vi.hoisted(() => ({
  docMock: vi.fn(),
  onboardingSetMock: vi.fn(),
  itemGetMock: vi.fn(),
  runTransactionMock: vi.fn(),
  userGetMock: vi.fn(),
  bucketMock: vi.fn(),
  fileMock: vi.fn(),
  saveMock: vi.fn(),
  createNotificationMock: vi.fn(),
  notifyDocSignedMock: vi.fn(),
  maybeFlagActivationReadyMock: vi.fn(),
  resolveSigningAlertTasksMock: vi.fn(),
  consoleErrorMock: vi.fn(),
}));

// Same module specifiers the sign route tests mock, so the helper keeps
// working inside those routes without either test knowing about the other.
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { doc: docMock, runTransaction: runTransactionMock },
  adminStorage: { bucket: bucketMock },
}));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: createNotificationMock,
}));
vi.mock('@/lib/onboarding/ownerNotify', () => ({ notifyDocSigned: notifyDocSignedMock }));
vi.mock('@/lib/onboarding/activation', () => ({
  maybeFlagActivationReady: maybeFlagActivationReadyMock,
}));
vi.mock('@/lib/alerts/alertTasks', () => ({
  resolveSigningAlertTasks: resolveSigningAlertTasksMock,
}));
vi.mock('@/types/onboarding', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', referenceKind: 'esign' },
    { id: 'onboarding_submission', label: 'Onboarding Submission', referenceKind: 'manual' },
  ],
}));

import { completeEsignItem, completedPdfPathFor } from './complete';
import { envelopeSuperseded } from './superseded';

const PDF = Buffer.from('%PDF-signed');

const input = (overrides: Partial<Parameters<typeof completeEsignItem>[0]> = {}) => ({
  userId: 'user-1',
  itemId: 'contract',
  envelopeId: 'env_current',
  pdf: PDF,
  ...overrides,
});

const itemDoc = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  data: () => data ?? undefined,
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
    path.startsWith('users/') ? { get: userGetMock } : { path }
  );
  // The approval is a transactional set on the onboarding item.
  runTransactionMock.mockImplementation(async (body: (tx: unknown) => Promise<unknown>) =>
    body({
      get: itemGetMock,
      set: (_ref: unknown, data: unknown, options: unknown) => onboardingSetMock(data, options),
    })
  );
  itemGetMock.mockResolvedValue(itemDoc({ esignEnvelopeId: 'env_current', status: 'submitted' }));
  onboardingSetMock.mockReturnValue(undefined);
  userGetMock.mockResolvedValue(userDoc('Rep One', 'rep@example.com'));
  bucketMock.mockReturnValue({ file: fileMock });
  fileMock.mockReturnValue({ save: saveMock });
  saveMock.mockResolvedValue(undefined);
  createNotificationMock.mockResolvedValue('notification-1');
  notifyDocSignedMock.mockResolvedValue(undefined);
  maybeFlagActivationReadyMock.mockResolvedValue(undefined);
  resolveSigningAlertTasksMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('completeEsignItem', () => {
  it('stores the signed pdf first, then approves with its path in one write', async () => {
    const result = await completeEsignItem(input());

    expect(docMock).toHaveBeenCalledWith('userOnboarding/user-1_contract');
    expect(bucketMock).toHaveBeenCalledWith('bucket.example');
    expect(fileMock).toHaveBeenCalledWith('esign-completed/user-1/contract.pdf');
    expect(saveMock).toHaveBeenCalledWith(PDF, {
      contentType: 'application/pdf',
      resumable: false,
    });
    expect(onboardingSetMock).toHaveBeenCalledOnce();
    expect(onboardingSetMock).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        itemId: 'contract',
        status: 'approved',
        rejectionReason: null,
        reviewedBy: 'system',
        reviewerName: 'E-sign (auto)',
        reviewedAt: expect.any(Date),
        updatedAt: expect.any(Date),
        completedPdfPath: 'esign-completed/user-1/contract.pdf',
      },
      { merge: true }
    );
    expect(saveMock.mock.invocationCallOrder[0]).toBeLessThan(
      onboardingSetMock.mock.invocationCallOrder[0]
    );
    expect(result).toEqual({
      completedPdfPath: 'esign-completed/user-1/contract.pdf',
      status: 'approved',
    });
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
    expect(onboardingSetMock.mock.calls[0][0]).not.toHaveProperty('completedPdfPath');
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(notifyDocSignedMock).toHaveBeenCalledOnce();
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ completedPdfPath: null, status: 'approved' });
  });

  it('approves nothing and sends nothing when the upload fails', async () => {
    saveMock.mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await completeEsignItem(input());

    expect(result).toEqual({ completedPdfPath: null, status: 'upload_failed' });
    expect(runTransactionMock).not.toHaveBeenCalled();
    expect(onboardingSetMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] completed pdf failed',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract', envelopeId: 'env_current' })
    );
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(notifyDocSignedMock).not.toHaveBeenCalled();
    expect(resolveSigningAlertTasksMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
  });

  it('approves nothing when the bucket is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', '');

    const result = await completeEsignItem(input());

    expect(bucketMock).not.toHaveBeenCalled();
    expect(result).toEqual({ completedPdfPath: null, status: 'upload_failed' });
    expect(onboardingSetMock).not.toHaveBeenCalled();
    expect(notifyDocSignedMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] completed pdf failed',
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('does not overwrite a rejection that landed while the rep was signing', async () => {
    // review/route.ts rejects by moving the envelope to supersededEnvelopeIds
    // and deleting esignEnvelopeId.
    itemGetMock.mockResolvedValue(
      itemDoc({ status: 'rejected', supersededEnvelopeIds: ['env_current'] })
    );

    const result = await completeEsignItem(input());

    expect(result).toEqual({ completedPdfPath: null, status: 'superseded' });
    expect(onboardingSetMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(notifyDocSignedMock).not.toHaveBeenCalled();
    expect(maybeFlagActivationReadyMock).not.toHaveBeenCalled();
  });

  it('does not approve from an envelope a newer one replaced', async () => {
    itemGetMock.mockResolvedValue(itemDoc({ status: 'submitted', esignEnvelopeId: 'env_newer' }));

    const result = await completeEsignItem(input());

    expect(result.status).toBe('superseded');
    expect(onboardingSetMock).not.toHaveBeenCalled();
  });

  it('approves an item with no onboarding doc yet', async () => {
    itemGetMock.mockResolvedValue(itemDoc(null));

    const result = await completeEsignItem(input());

    expect(result.status).toBe('approved');
    expect(onboardingSetMock).toHaveBeenCalledOnce();
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
      status: 'approved',
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
      status: 'approved',
    });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] failed to flag activation readiness',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract' })
    );
  });

  it('closes the rep\'s signing alerts after the approval is written', async () => {
    // An active rep never re-enters activation, so without this a signing
    // alert re-nagged the back office daily about a signed document.
    await completeEsignItem(input());

    expect(resolveSigningAlertTasksMock).toHaveBeenCalledWith('user-1');
    expect(onboardingSetMock.mock.invocationCallOrder[0]).toBeLessThan(
      resolveSigningAlertTasksMock.mock.invocationCallOrder[0]
    );
  });

  it('does not throw when closing signing alerts fails', async () => {
    resolveSigningAlertTasksMock.mockRejectedValueOnce(new Error('alerts query failed'));

    await expect(completeEsignItem(input())).resolves.toEqual({
      completedPdfPath: 'esign-completed/user-1/contract.pdf',
      status: 'approved',
    });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] failed to resolve signing alerts',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract' })
    );
    expect(maybeFlagActivationReadyMock).toHaveBeenCalledWith('user-1');
  });

  it('propagates a failed approval write without notifying anyone', async () => {
    runTransactionMock.mockRejectedValueOnce(new Error('firestore unavailable'));

    await expect(completeEsignItem(input())).rejects.toThrow('firestore unavailable');
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(notifyDocSignedMock).not.toHaveBeenCalled();
    expect(resolveSigningAlertTasksMock).not.toHaveBeenCalled();
  });

  it('reports the approval when the rep notification fails, so the sign is not retried', async () => {
    // A thrown error used to make the sign route release the claim after the
    // approval was written; every retry then approved and notified again.
    createNotificationMock.mockRejectedValueOnce(new Error('notifications unavailable'));

    await expect(completeEsignItem(input())).resolves.toEqual({
      completedPdfPath: 'esign-completed/user-1/contract.pdf',
      status: 'approved',
    });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign complete] rep signed notification failed',
      expect.objectContaining({ userId: 'user-1', itemId: 'contract' })
    );
    expect(notifyDocSignedMock).toHaveBeenCalledOnce();
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

describe('envelopeSuperseded', () => {
  it('flags an envelope in supersededEnvelopeIds or replaced by a newer one', () => {
    expect(envelopeSuperseded({ supersededEnvelopeIds: ['env-1'] }, 'env-1')).toBe(true);
    expect(envelopeSuperseded({ esignEnvelopeId: 'env-2' }, 'env-1')).toBe(true);
    expect(envelopeSuperseded({ esignEnvelopeId: 'env-1' }, 'env-1')).toBe(false);
    expect(envelopeSuperseded(undefined, 'env-1')).toBe(false);
  });
});

describe('completedPdfPathFor', () => {
  it('keeps the storage layout the signed-pdf route reads', () => {
    expect(completedPdfPathFor('user-1', 'contract')).toBe('esign-completed/user-1/contract.pdf');
  });
});
