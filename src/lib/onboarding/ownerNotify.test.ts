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

import { getOwnerRecipients, notifyDocSigned, notifyOnboardingSubmitted, sendOnboardingPacket } from './ownerNotify';

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

  it('sends the W-9 / direct-deposit / contract PDFs and the masked SSN to owner accounts only', async () => {
    downloadMock.mockImplementation(async () => [Buffer.from('pdf')]);
    await sendOnboardingPacket({ userId: 'u1' });

    type Sent = { to: string; attachments?: Array<{ name: string }>; textBody: string };
    const sent = (sendEmailMock.mock.calls as unknown as Array<[Sent]>).map(([email]) => email);
    const owner = sent.find((email) => email.to === 'owner@example.com');
    const extra = sent.find((email) => email.to === 'extra@example.com');
    if (!owner || !extra) throw new Error('expected an owner and an extra email');

    expect(owner.attachments?.map((a) => a.name)).toEqual(['contract.pdf', 'direct.pdf']);
    expect(owner.textBody).toContain('SSN: ***-**-1234');

    // The contract carries the EIN; the extra addresses are not checked to be owners.
    expect(extra.attachments?.map((a) => a.name)).toEqual([]);
    expect(extra.textBody).not.toContain('contract.pdf');
    expect(extra.textBody).not.toContain('direct.pdf');
    expect(extra.textBody).not.toContain('SSN');
    expect(extra.textBody).toContain('DL: ********9876');
  });
});

describe('notifyOnboardingSubmitted', () => {
  const submittedAt = new Date('2026-10-22T20:05:00Z');

  it('sends the short owner alert with name, role, time and the review link', async () => {
    await notifyOnboardingSubmitted({
      userId: 'u 1',
      user: { displayName: 'Sam Rep', fieldRole: 'entry_level_rep', email: 'sam@example.com' },
      submittedAt,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      from: 'onboarding@example.com',
      subject: 'Sam Rep submitted onboarding',
      textBody: 'Sam Rep submitted onboarding.\n\nRole: Entry Level Rep\nSubmitted: Oct 22, 2026, 3:05 PM CT\n\n'
        + 'Review onboarding: https://portal.example/portal/admin/onboarding?tab=todo&person=u%201\n',
    }));
  });

  it("falls back to 'A new hire', never the rep's email, when there is no name", async () => {
    await notifyOnboardingSubmitted({ userId: 'u1', user: { displayName: '  ', email: 'sam@example.com' }, submittedAt });

    const email = (sendEmailMock.mock.calls as unknown as Array<[Record<string, string>]>)[0]![0];
    expect(email.subject).toBe('A new hire submitted onboarding');
    expect(`${email.textBody}${email.htmlBody}`).not.toContain('sam@example.com');
  });

  it('labels the role from the resolved fieldRole the caller passes', async () => {
    await notifyOnboardingSubmitted({
      userId: 'u1',
      user: { displayName: 'Legacy Rep', role: 'entry_level_rep' },
      submittedAt,
      fieldRole: 'entry_level_rep',
    });

    const email = (sendEmailMock.mock.calls as unknown as Array<[Record<string, string>]>)[0]![0];
    expect(email.textBody).toContain('Role: Entry Level Rep');
  });

  it.each([['test', { testAccount: true }], ['demo', { demoAccount: true }]])(
    'sends nothing for a %s account',
    async (_label, flag) => {
      await notifyOnboardingSubmitted({ userId: 'u1', user: { displayName: 'QA', ...flag }, submittedAt });
      expect(sendEmailMock).not.toHaveBeenCalled();
    }
  );
});

describe('sendOnboardingPacket tally', () => {
  it('counts every attempted and delivered copy', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'postmark_500' } as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(sendOnboardingPacket({ userId: 'u1' })).resolves.toEqual({ attempted: 2, ok: 1 });
    errSpy.mockRestore();
  });

  it('reports nothing attempted when there are no recipients or the lookup failed', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ownerQueryGetMock.mockRejectedValue(new Error('firestore down'));

    await expect(sendOnboardingPacket({ userId: 'u1' })).resolves.toEqual({ attempted: 0, ok: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('sendEach failure logging', () => {
  it('logs each failed recipient with the alert kind and uid, never the subject, and does not throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendEmailMock
      .mockResolvedValueOnce({ ok: false, error: 'postmark_422' } as never)
      .mockRejectedValueOnce(new Error('boom'));

    await expect(notifyDocSigned({ userId: 'u1', repName: 'Sam Rep', itemLabel: 'Contract' })).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledWith('[onboarding owner notify] email failed', {
      kind: 'doc_signed',
      userId: 'u1',
      to: 'owner@example.com',
      error: 'postmark_422',
    });
    expect(errSpy).toHaveBeenCalledWith('[onboarding owner notify] email failed', expect.objectContaining({
      kind: 'doc_signed',
      userId: 'u1',
      to: 'extra@example.com',
    }));
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('Sam Rep');
    errSpy.mockRestore();
  });

  it('logs nothing when every send succeeds', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await notifyDocSigned({ userId: 'u1', repName: 'Sam Rep', itemLabel: 'Contract' });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
