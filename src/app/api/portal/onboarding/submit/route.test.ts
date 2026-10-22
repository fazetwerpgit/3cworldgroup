import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decryptField } from '@/lib/security/fieldEncryption';

const {
  userDocGetMock,
  progressGetMock,
  sensitiveGetMock,
  gateMock,
  batchSetMock,
  batchCommitMock,
  verifyStorageReferenceMock,
} = vi.hoisted(() => ({
  userDocGetMock: vi.fn(),
  progressGetMock: vi.fn(),
  sensitiveGetMock: vi.fn(),
  gateMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  verifyStorageReferenceMock: vi.fn(),
}));
const { sendEmailMock, afterTasks } = vi.hoisted(() => ({
  sendEmailMock: vi.fn<(input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>>(async () => ({ ok: true })),
  afterTasks: [] as Promise<unknown>[],
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn((callback: () => unknown) => void afterTasks.push(Promise.resolve(callback()))) };
});
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => {
        if (name === 'users') return { get: userDocGetMock };
        const path = `${name}/${id}`;
        return { path, get: name === 'userSensitive' ? sensitiveGetMock : progressGetMock };
      }),
      // Owner recipients (lib/onboarding/ownerNotify).
      where: vi.fn(() => ({
        get: async () => ({ docs: [{ data: () => ({ email: 'owner@example.com', role: 'owner' }) }] }),
      })),
    })),
    doc: vi.fn(() => ({ get: async () => ({ data: () => ({ extraEmails: ['extra@example.com'] }) }) })),
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
    // The item's status read and the writes run in one transaction.
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const result = await fn({ get: (ref: { get: () => Promise<unknown> }) => ref.get(), set: batchSetMock });
      if (batchSetMock.mock.calls.length) await batchCommitMock();
      return result;
    }),
  },
}));
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: sendEmailMock,
  onboardingFrom: vi.fn(() => 'onboarding@example.com'),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedSelfOrManagement: gateMock,
}));
vi.mock('@/lib/onboarding/verifyStorageReference', () => ({
  verifyStorageReference: verifyStorageReferenceMock,
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/onboarding/submit', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const DL_FOLDER = 'onboarding/u1/dl_photos/';

function writeTo(path: string) {
  return batchSetMock.mock.calls.find(([ref]) => ref?.path === path);
}

beforeAll(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam Rep', isAdmin: false });
  userDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ fieldRole: 'entry_level_rep', isIBO: false, status: 'pending' }),
  });
  progressGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  sensitiveGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  verifyStorageReferenceMock.mockResolvedValue({ ok: true });
  batchCommitMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue({ ok: true });
  afterTasks.length = 0;
  vi.stubEnv('APP_BASE_URL', 'https://portal.example');
});

async function flushAfter() {
  await Promise.all(afterTasks);
}

describe('POST /api/portal/onboarding/submit', () => {
  it('rejects a typed reference for a signature item', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'contract', reference: 'typed fake signature' })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'E-signature items are completed by signing them and do not accept typed references',
    });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a submission for a user who is no longer pending', async () => {
    userDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ fieldRole: 'entry_rep', isIBO: false, status: 'active' }),
    });

    const response = await POST(request({ userId: 'u1', itemId: 'insurance', reference: 'onboarding/users/u1/insurance/' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Onboarding is closed for this user',
    });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a management submission on behalf of a user who is no longer pending', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin1', name: 'Admin', isAdmin: true });
    userDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ fieldRole: 'entry_rep', isIBO: false, status: 'active' }),
    });

    const response = await POST(request({ userId: 'u1', itemId: 'insurance', reference: 'onboarding/users/u1/insurance/' }));

    expect(response.status).toBe(403);
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  // Same rule as the invite form: a non-upload item needs a note.
  it('rejects a blank note and accepts a typed one', async () => {
    const blank = await POST(request({ userId: 'u1', itemId: 'onboarding_submission', reference: '   ' }));
    expect(blank.status).toBe(400);
    await expect(blank.json()).resolves.toEqual({ error: 'Add a note or reference' });
    expect(batchSetMock).not.toHaveBeenCalled();

    const typed = await POST(request({ userId: 'u1', itemId: 'onboarding_submission', reference: ' Start 10/1 ' }));
    expect(typed.status).toBe(200);
    expect(writeTo('userOnboarding/u1_onboarding_submission')?.[1]).toMatchObject({
      status: 'submitted',
      reference: 'Start 10/1',
    });
  });
});

describe('POST /api/portal/onboarding/submit - driver license', () => {
  it('rejects the license photos without a number when none is on file', async () => {
    const response = await POST(request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter your driver's license number" });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a number without both photos', async () => {
    verifyStorageReferenceMock.mockResolvedValue({ ok: false, error: 'Missing back.* in the upload folder' });

    const response = await POST(
      request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER, dlNumber: 'D1234567' })
    );

    expect(response.status).toBe(400);
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed number without writing anything', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER, dlNumber: '12' })
    );

    expect(response.status).toBe(400);
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('encrypts the number into userSensitive, merges it, and never echoes it', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER, dlNumber: 'D1234567' })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('D1234567');

    const sensitiveWrite = writeTo('userSensitive/u1');
    expect(sensitiveWrite).toBeDefined();
    const [, stored, options] = sensitiveWrite!;
    expect(options).toEqual({ merge: true });
    expect(stored.dlNumberEncrypted).not.toContain('D1234567');
    expect(decryptField(stored.dlNumberEncrypted)).toBe('D1234567');
    expect(stored.dlLast4).toBe('4567');
    // A merge that carried SSN keys would clobber the one from the website form.
    expect(stored).not.toHaveProperty('ssnEncrypted');
    expect(stored).not.toHaveProperty('ssnLast4');

    const itemWrite = writeTo('userOnboarding/u1_dl_photos');
    expect(itemWrite?.[1]).toMatchObject({ status: 'submitted', reference: DL_FOLDER });
    expect(JSON.stringify(itemWrite?.[1])).not.toContain('D1234567');
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('accepts the photos alone when a number is already on file', async () => {
    sensitiveGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ dlNumberEncrypted: 'already.on.file', dlLast4: '4567' }),
    });

    const response = await POST(request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER }));

    expect(response.status).toBe(200);
    expect(writeTo('userSensitive/u1')).toBeUndefined();
    expect(writeTo('userOnboarding/u1_dl_photos')).toBeDefined();
  });
});

describe('POST /api/portal/onboarding/submit - owner alert', () => {
  const rep = (extra: Record<string, unknown> = {}) => ({
    exists: true,
    data: () => ({
      displayName: 'Sam Rep',
      email: 'sam@example.com',
      fieldRole: 'entry_level_rep',
      isIBO: false,
      status: 'pending',
      address: '12 Hidden Lane',
      dateOfBirth: '1990-04-05',
      ssnLast4: '6789',
      ...extra,
    }),
  });
  const submitForm = () =>
    POST(request({ userId: 'u1', itemId: 'onboarding_submission', reference: 'Start date 10/1' }));
  const sent = () => sendEmailMock.mock.calls.map(([input]) => input as Record<string, string>);

  beforeEach(() => {
    userDocGetMock.mockResolvedValue(rep());
  });

  it('emails each owner recipient once, with name, role, time and the review link only', async () => {
    const response = await submitForm();
    await flushAfter();

    expect(response.status).toBe(200);
    expect(sent().map((email) => email.to).sort()).toEqual(['extra@example.com', 'owner@example.com']);
    for (const email of sent()) {
      expect(email.subject).toBe('Sam Rep submitted onboarding');
      expect(email.from).toBe('onboarding@example.com');
      expect(email.textBody).toContain('Role: Entry Level Rep');
      expect(email.textBody).toMatch(/Submitted: \w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s[AP]M CT/);
      expect(email.textBody).toContain('https://portal.example/portal/admin/onboarding?tab=todo&person=u1');
      const all = `${email.subject}${email.textBody}${email.htmlBody}`;
      for (const secret of ['12 Hidden Lane', '1990-04-05', '6789', 'sam@example.com', 'Start date 10/1']) {
        expect(all).not.toContain(secret);
      }
    }
  });

  it('sends nothing when an already-submitted form is saved again', async () => {
    progressGetMock.mockResolvedValue({ exists: true, data: () => ({ status: 'submitted' }) });

    const response = await submitForm();
    await flushAfter();

    expect(response.status).toBe(400);
    expect(batchSetMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('alerts again when the form is resubmitted after being sent back', async () => {
    progressGetMock.mockResolvedValue({ exists: true, data: () => ({ status: 'rejected' }) });

    const response = await submitForm();
    await flushAfter();

    expect(response.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it('sends nothing for a test account', async () => {
    userDocGetMock.mockResolvedValue(rep({ testAccount: true }));

    const response = await submitForm();
    await flushAfter();

    expect(response.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends nothing for any other checklist item', async () => {
    const response = await POST(request({ userId: 'u1', itemId: 'background_check', reference: 'VENDOR-REF-1' }));
    await flushAfter();

    expect(response.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('still saves the submission when the email fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'postmark_500' });
    sendEmailMock.mockRejectedValueOnce(new Error('network down'));

    const response = await submitForm();
    await flushAfter();

    expect(response.status).toBe(200);
    expect(writeTo('userOnboarding/u1_onboarding_submission')?.[1]).toMatchObject({ status: 'submitted' });
    expect(errSpy).toHaveBeenCalledWith(
      '[onboarding owner notify] email failed',
      expect.objectContaining({ kind: 'onboarding_submitted', userId: 'u1' })
    );
    errSpy.mockRestore();
  });
});
