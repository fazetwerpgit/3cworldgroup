import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock, userGetMock, userUpdateMock, createAlertTaskMock, getInviteMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  userGetMock: vi.fn(),
  userUpdateMock: vi.fn(),
  createAlertTaskMock: vi.fn(),
  getInviteMock: vi.fn(),
}));

const nameTaken = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/users/displayNameTaken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/users/displayNameTaken')>()),
  isDisplayNameTaken: vi.fn(async () => nameTaken.value),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: { doc: vi.fn((path: string) => ({ get: () => userGetMock(path), update: userUpdateMock })) },
}));
vi.mock('@/lib/alerts/alertTasks', () => ({ createAlertTask: createAlertTaskMock }));
vi.mock('@/lib/recruiting/inviteLookup', () => ({
  getInviteByToken: getInviteMock,
  inviteSignupState: (data: { status?: string }) => (data.status === 'open' ? 'open' : data.status === 'submitted' ? 'submitted' : null),
}));

import { POST } from './route';
import { signupNotifyLimiter } from '@/lib/auth/teamCode';
import { issueCaptchaPass } from '@/lib/auth/captchaPass';

const TEAM_CODE = '3cteam';

function pendingUser(data: Record<string, unknown>) {
  return { exists: true, get: (key: string) => data[key] };
}

function request(init: { token?: string; body?: unknown; ip?: string } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': init.ip ?? '203.0.113.5' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return new Request('http://localhost/api/portal/auth/signup-notify', {
    method: 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signupNotifyLimiter.reset();
  vi.stubEnv('PORTAL_TEAM_CODE', TEAM_CODE);
  vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
  verifyIdTokenMock.mockImplementation(async (token: string) => {
    if (token === 'token-new-user') return { uid: 'new-user', email: 'new.hire@gmail.com', firebase: { sign_in_provider: 'password' } };
    if (token === 'token-google-user') return { uid: 'new-user', firebase: { sign_in_provider: 'google.com' } };
    if (token === 'token-apple-user') return { uid: 'new-user', firebase: { sign_in_provider: 'apple.com' } };
    throw new Error('bad token');
  });
  userGetMock.mockResolvedValue(
    pendingUser({ status: 'pending', email: 'new.hire@gmail.com', displayName: 'New Hire' })
  );
  createAlertTaskMock.mockResolvedValue('task-1');
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/portal/auth/signup-notify', () => {
  it('refuses a body-supplied uid with no token', async () => {
    const response = await POST(request({ body: { uid: 'victim' } }));

    expect(response.status).toBe(401);
    expect(userGetMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('refuses an invalid token', async () => {
    const response = await POST(request({ token: 'forged', body: { uid: 'victim' } }));

    expect(response.status).toBe(401);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('raises the alert for the token holder, ignoring any uid in the body', async () => {
    const response = await POST(
      request({ token: 'token-new-user', body: { uid: 'victim', code: ` ${TEAM_CODE.toUpperCase()} ` } })
    );

    expect(response.status).toBe(200);
    expect(userGetMock).toHaveBeenCalledWith('users/new-user');
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pending_assignment', subjectUserId: 'new-user' })
    );
  });

  it('raises no alert for a password signup without a valid team code', async () => {
    for (const body of [undefined, {}, { code: 'wrong' }]) {
      const response = await POST(request({ token: 'token-new-user', body }));
      expect(response.status).toBe(403);
    }
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('flags a password signup that skipped the team code check, keeping it out of the pending queue', async () => {
    const response = await POST(request({ token: 'token-new-user', body: { code: 'guess' } }));

    expect(response.status).toBe(403);
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ suspectedBot: true, signupGateFailed: true }));
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('accepts a password signup from an open 3C invite without the team code', async () => {
    getInviteMock.mockResolvedValue({ data: { status: 'open' } });
    const response = await POST(
      request({ token: 'token-new-user', body: { code: '', inviteToken: 'a'.repeat(43) } })
    );

    expect(response.status).toBe(200);
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).toHaveBeenCalledWith(expect.objectContaining({ subjectUserId: 'new-user' }));
  });

  it('refuses an invite that is no longer open, or a malformed token', async () => {
    getInviteMock.mockResolvedValue({ data: { status: 'submitted' } });
    expect((await POST(request({ token: 'token-new-user', body: { inviteToken: 'a'.repeat(43) } }))).status).toBe(403);
    getInviteMock.mockClear();
    expect((await POST(request({ token: 'token-new-user', body: { inviteToken: '../x' } }))).status).toBe(403);
    expect(getInviteMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('fails closed when PORTAL_TEAM_CODE is unset', async () => {
    vi.stubEnv('PORTAL_TEAM_CODE', '');
    const response = await POST(request({ token: 'token-new-user', body: { code: TEAM_CODE } }));

    expect(response.status).toBe(403);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  describe('with reCAPTCHA configured', () => {
    beforeEach(() => vi.stubEnv('RECAPTCHA_SECRET_KEY', 'captcha-secret'));

    it('refuses and flags a password signup that never passed the captcha', async () => {
      const response = await POST(request({ token: 'token-new-user', body: { code: TEAM_CODE } }));

      expect(response.status).toBe(403);
      expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ suspectedBot: true, signupGateFailed: true }));
      expect(createAlertTaskMock).not.toHaveBeenCalled();
    });

    it('refuses a pass issued for another email, signed with another key, or expired', async () => {
      for (const captchaPass of [
        issueCaptchaPass('someone.else@gmail.com', 'captcha-secret'),
        issueCaptchaPass('new.hire@gmail.com', 'other-secret'),
        issueCaptchaPass('new.hire@gmail.com', 'captcha-secret', Date.now() - 11 * 60 * 1000),
        'garbage',
      ]) {
        const response = await POST(request({ token: 'token-new-user', body: { code: TEAM_CODE, captchaPass } }));
        expect(response.status).toBe(403);
      }
      expect(createAlertTaskMock).not.toHaveBeenCalled();
    });

    it('raises the alert for a password signup with the team code and its captcha pass', async () => {
      const captchaPass = issueCaptchaPass('New.Hire@gmail.com', 'captcha-secret');
      const response = await POST(request({ token: 'token-new-user', body: { code: TEAM_CODE, captchaPass } }));

      expect(response.status).toBe(200);
      expect(createAlertTaskMock).toHaveBeenCalledWith(expect.objectContaining({ subjectUserId: 'new-user' }));
    });

  });

  it('fails closed in production when the reCAPTCHA secret is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await POST(request({ token: 'token-new-user', body: { code: TEAM_CODE } }));

    expect(response.status).toBe(403);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it.each(['token-apple-user', 'token-google-user'])(
    'refuses a social sign-in (%s): it never creates an account, so no owner alert',
    async (token) => {
      const response = await POST(request({ token }));
      expect(response.status).toBe(403);
      expect(createAlertTaskMock).not.toHaveBeenCalled();
      expect(userUpdateMock).not.toHaveBeenCalled();
    }
  );

  it('refuses a social sign-in even with the team code', async () => {
    const response = await POST(request({ token: 'token-apple-user', body: { code: TEAM_CODE } }));
    expect(response.status).toBe(403);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('rate-limits one IP', async () => {
    const gated = { code: TEAM_CODE };
    for (let i = 0; i < 10; i++) {
      expect((await POST(request({ token: 'token-new-user', body: gated, ip: '198.51.100.7' }))).status).toBe(200);
    }
    const limited = await POST(request({ token: 'token-new-user', body: gated, ip: '198.51.100.7' }));
    expect(limited.status).toBe(429);
    expect((await POST(request({ token: 'token-new-user', body: gated, ip: '198.51.100.8' }))).status).toBe(200);
  });
});
