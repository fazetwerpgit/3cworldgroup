import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ownerQueryGetMock,
  configGetMock,
  userGetMock,
  sensitiveGetMock,
  onboardingQueryGetMock,
  sendEmailMock,
  downloadMock,
  fileMock,
  bucketMock,
} = vi.hoisted(() => {
  const downloadMock = vi.fn();
  const fileMock = vi.fn(() => ({ download: downloadMock }));
  const bucketMock = { file: fileMock };
  return {
    ownerQueryGetMock: vi.fn(),
    configGetMock: vi.fn(),
    userGetMock: vi.fn(),
    sensitiveGetMock: vi.fn(),
    onboardingQueryGetMock: vi.fn(),
    sendEmailMock: vi.fn(async () => ({ ok: true })),
    downloadMock,
    fileMock,
    bucketMock,
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      where: vi.fn(() => ({
        get: name === 'users' ? ownerQueryGetMock : onboardingQueryGetMock,
      })),
    })),
    doc: vi.fn((path: string) => ({
      get: path === 'config/onboardingNotifications'
        ? configGetMock
        : path.startsWith('userSensitive/') ? sensitiveGetMock : userGetMock,
    })),
  },
  adminStorage: { bucket: vi.fn(() => bucketMock) },
}));
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: sendEmailMock,
  onboardingFrom: vi.fn(() => 'onboarding@example.com'),
}));

import { getOwnerRecipients, notifyDocSigned, sendOnboardingPacket } from './ownerNotify';

const ownerDoc = (email: string) => ({ data: () => ({ email }) });
const progressDoc = (data: Record<string, unknown>) => ({
  id: String(data.itemId),
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'bucket.example');
  vi.stubEnv('APP_BASE_URL', 'https://portal.example');
  ownerQueryGetMock.mockResolvedValue({ docs: [ownerDoc('owner@example.com'), ownerDoc('OWNER@example.com'), ownerDoc('')] });
  configGetMock.mockResolvedValue({ data: () => ({ extraEmails: ['extra@example.com', 'owner@example.com', 'invalid'] }) });
  userGetMock.mockResolvedValue({ data: () => ({
    displayName: 'Sam Rep',
    email: 'sam@example.com',
    phone: '555-0100',
    fieldRole: 'entry_level_rep',
    isIBO: true,
    createdAt: new Date('2026-08-20T12:00:00Z'),
  }) });
  sensitiveGetMock.mockResolvedValue({ data: () => ({ ssnLast4: '1234', dlLast4: '9876', ssnEncrypted: 'DO-NOT-READ' }) });
  onboardingQueryGetMock.mockResolvedValue({ docs: [
    progressDoc({ itemId: 'contract', status: 'approved', submittedAt: new Date('2026-08-20'), reviewedAt: new Date('2026-08-21'), completedPdfPath: 'esign-completed/u1/contract.pdf' }),
    progressDoc({ itemId: 'direct_deposit', status: 'approved', completedPdfPath: 'esign-completed/u1/direct.pdf' }),
  ] });
  downloadMock.mockImplementation(async (path: string) => [Buffer.from(path.includes('contract') ? 'contract-pdf' : 'direct-pdf')]);
});

describe('getOwnerRecipients', () => {
  it('merges owner and configured extra emails, deduping and dropping invalid values', async () => {
    await expect(getOwnerRecipients()).resolves.toEqual(['owner@example.com', 'extra@example.com']);
    expect(ownerQueryGetMock).toHaveBeenCalledOnce();
    expect(configGetMock).toHaveBeenCalledOnce();
  });

  it("includes owners whose docs store the address under legacy 'Email'", async () => {
    ownerQueryGetMock.mockResolvedValue({ docs: [{ data: () => ({ Email: 'legacy@example.com' }) }] });
    configGetMock.mockResolvedValue({ data: () => ({}) });
    await expect(getOwnerRecipients()).resolves.toEqual(['legacy@example.com']);
  });
});

describe('notifyDocSigned', () => {
  it('sends one owner email per recipient', async () => {
    await notifyDocSigned({ userId: 'u1', repName: 'Sam Rep', itemLabel: 'Contract' });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      subject: 'Sam Rep signed Contract',
      from: 'onboarding@example.com',
    }));
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'extra@example.com',
      htmlBody: expect.stringContaining('https://portal.example/portal/admin/onboarding'),
    }));
  });
});

describe('sendOnboardingPacket', () => {
  it('masks sensitive values, includes checklist data, attaches stored PDFs, and enforces 8MB', async () => {
    const large = Buffer.alloc(5 * 1024 * 1024, 1);
    const second = Buffer.alloc(4 * 1024 * 1024, 2);
    downloadMock
      .mockResolvedValueOnce([large])
      .mockResolvedValueOnce([second]);

    await sendOnboardingPacket({ userId: 'u1' });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const packet = (sendEmailMock.mock.calls as unknown as Array<[{
      attachments?: Array<Record<string, string>>;
      textBody: string;
    }]>)[0]?.[0];
    if (!packet?.attachments) throw new Error('packet email missing attachments');
    expect(packet.attachments).toHaveLength(1);
    expect(packet.attachments[0]).toMatchObject({ name: 'contract.pdf', contentType: 'application/pdf' });
    expect(packet.textBody).toContain('SSN: ***-**-1234');
    expect(packet.textBody).toContain('DL: ********9876');
    expect(packet.textBody).not.toContain('DO-NOT-READ');
    expect(packet.textBody).toContain('Full values: portal → Admin → Users → reveal (audited).');
    expect(packet.textBody).toContain('Contract: Approved');
    expect(packet.textBody).toContain('Not attached: direct.pdf (over the 8MB email limit)');
    expect(packet.textBody).toContain('https://portal.example/portal/admin/onboarding');
  });
});
